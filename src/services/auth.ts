import { User, UserRole } from '@/types';
import { logAudit } from './audit';
import { db, nowIso, setSetting } from './database';
import {
  authRequest,
  clearSession,
  getAccessToken,
  getStoredSession,
  requestPasswordRecovery,
  signInWithPassword,
  signOutFromSupabase,
  SupabaseRequestError,
  supabaseRequest,
} from './supabase';

let recoveryAccessToken: string | null = null;

interface ProfileRow {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: 'active' | 'suspended';
  facility_id: string | null;
  avatar_uri: string | null;
  created_at: string;
}

interface CachedUserRow extends ProfileRow {
  password_hash: string;
  salt: string;
}

function mapUser(row: ProfileRow): User {
  const avatar = row.avatar_uri
    ? db.getFirstSync<{ uri: string }>('SELECT uri FROM media_assets WHERE remote_path = ?', [row.avatar_uri])
    : null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    facilityId: row.facility_id,
    avatarUri: avatar?.uri ?? row.avatar_uri,
    createdAt: row.created_at,
  };
}

function cacheUser(profile: ProfileRow): User {
  if (profile.facility_id) {
    db.runSync(
      `INSERT OR IGNORE INTO facilities (id, name, type, district, region, logo_uri, created_at)
       VALUES (?, 'Assigned Facility', 'health_centre', '', '', NULL, ?)`,
      [profile.facility_id, profile.created_at || nowIso()]
    );
  }
  db.runSync(
    `INSERT INTO users (id, username, email, full_name, role, status, facility_id, avatar_uri, password_hash, salt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       email = excluded.email,
       full_name = excluded.full_name,
       role = excluded.role,
       status = excluded.status,
       facility_id = excluded.facility_id,
       avatar_uri = excluded.avatar_uri`,
    [
      profile.id,
      profile.username,
      profile.email,
      profile.full_name,
      profile.role,
      profile.status,
      profile.facility_id,
      profile.avatar_uri,
      profile.created_at,
    ]
  );
  return mapUser(profile);
}

function getCachedUser(id: string): User | null {
  const row = db.getFirstSync<CachedUserRow>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? mapUser(row) : null;
}

async function getProfile(id: string): Promise<User | null> {
  const query = `/rest/v1/profiles?select=id,username,email,full_name,role,status,facility_id,avatar_uri,created_at&id=eq.${encodeURIComponent(id)}&limit=1`;
  const rows = await supabaseRequest<ProfileRow[]>(query);
  if (!rows.length) return null;
  return cacheUser(rows[0]);
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const session = await signInWithPassword(email.trim().toLowerCase(), password);
    const user = await getProfile(session.user.id);
    if (!user) {
      await clearSession();
      return {
        ok: false,
        error: 'Your account profile is not set up yet. Ask your administrator to finish account setup.',
      };
    }
    if (user.status !== 'active') {
      await clearSession();
      return { ok: false, error: 'This account has been suspended. Contact your administrator.' };
    }
    logAudit(user, 'LOGIN', 'User signed in with Supabase Auth');
    return { ok: true, user };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to sign in. Check your connection and try again.',
    };
  }
}

export async function restoreSession(): Promise<User | null> {
  const session = await getStoredSession();
  if (!session) return null;
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const user = await getProfile(session.user.id);
    if (user?.status === 'suspended') {
      await clearSession();
      return null;
    }
    return user ?? getCachedUser(session.user.id);
  } catch (error) {
    if (error instanceof SupabaseRequestError && (error.status === 401 || error.status === 403)) {
      await clearSession();
      return null;
    }
    return getCachedUser(session.user.id);
  }
}

export async function logout(user: User | null): Promise<void> {
  if (user) logAudit(user, 'LOGOUT', 'User signed out');
  await signOutFromSupabase();
}

export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<string | null> {
  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) return policyError;
  try {
    await signInWithPassword(user.email, currentPassword);
    await authRequest('/auth/v1/user', {
      method: 'PUT',
      token: await getAccessToken(),
      body: { password: newPassword },
    });
    logAudit(user, 'PASSWORD_CHANGED', 'User changed own password');
    return null;
  } catch (error) {
    return error instanceof SupabaseRequestError && error.status === 400
      ? 'Current password is incorrect.'
      : error instanceof Error
        ? error.message
        : 'Unable to change password. Try again.';
  }
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return 'Password must contain at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.';
  return null;
}

export async function resetPassword(email: string): Promise<string | null> {
  if (!email.trim()) return 'Enter the email address registered to your account.';
  try {
    await requestPasswordRecovery(email.trim().toLowerCase());
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Unable to send a reset email. Try again.';
  }
}

export function acceptPasswordRecoveryUrl(url: string): boolean {
  const fragment = url.split('#')[1];
  if (!fragment) return false;
  const params = new URLSearchParams(fragment);
  if (params.get('type') !== 'recovery' || !params.get('access_token')) return false;
  recoveryAccessToken = params.get('access_token');
  return true;
}

export async function completePasswordRecovery(password: string): Promise<string | null> {
  const policyError = validatePasswordPolicy(password);
  if (policyError) return policyError;
  if (!recoveryAccessToken) return 'This reset link is invalid or expired. Request a new one.';
  try {
    await authRequest('/auth/v1/user', {
      method: 'PUT',
      token: recoveryAccessToken,
      body: { password },
    });
    recoveryAccessToken = null;
    await clearSession();
    return null;
  } catch (error) {
    if (error instanceof SupabaseRequestError && (error.status === 401 || error.status === 403)) {
      recoveryAccessToken = null;
      return 'This reset link has expired. Request a new one.';
    }
    return error instanceof Error ? error.message : 'Unable to update the password. Try again.';
  }
}

export function getUserById(id: string): User | null {
  return getCachedUser(id);
}

export async function updateAvatar(user: User, avatarUri: string | null): Promise<void> {
  db.runSync('UPDATE users SET avatar_uri = ? WHERE id = ?', [avatarUri, user.id]);
  setSetting(`profile.avatar.pending.${user.id}`, JSON.stringify(avatarUri));
  logAudit(user, 'PROFILE_UPDATED', 'Profile photo updated');
}

export async function refreshCurrentUser(): Promise<User | null> {
  const session = await getStoredSession();
  if (!session) return null;
  return getProfile(session.user.id);
}

export async function getCurrentAccessToken(): Promise<string | null> {
  return getAccessToken();
}
