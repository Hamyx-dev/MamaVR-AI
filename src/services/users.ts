import { User, UserRole } from '@/types';
import { validatePasswordPolicy } from './auth';
import { logAudit } from './audit';
import { db, nowIso } from './database';
import { getCurrentAccessToken } from './auth';
import { supabaseRequest } from './supabase';

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

function cacheUser(user: User): void {
  if (user.facilityId) {
    db.runSync(
      `INSERT OR IGNORE INTO facilities (id, name, type, district, region, logo_uri, created_at)
       VALUES (?, 'Assigned Facility', 'health_centre', '', '', NULL, ?)`,
      [user.facilityId, user.createdAt || nowIso()]
    );
  }
  db.runSync(
    `INSERT INTO users (id, username, email, full_name, role, status, facility_id, avatar_uri, password_hash, salt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username, email = excluded.email, full_name = excluded.full_name,
       role = excluded.role, status = excluded.status, facility_id = excluded.facility_id,
       avatar_uri = excluded.avatar_uri`,
    [
      user.id,
      user.username,
      user.email,
      user.fullName,
      user.role,
      user.status,
      user.facilityId,
      user.avatarUri,
      user.createdAt,
    ]
  );
}

export async function listUsers(): Promise<User[]> {
  const rows = await supabaseRequest<ProfileRow[]>(
    '/rest/v1/profiles?select=id,username,email,full_name,role,status,facility_id,avatar_uri,created_at&order=full_name.asc'
  );
  const users = rows.map(mapUser);
  users.forEach(cacheUser);
  return users;
}

export interface CreateUserInput {
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  facilityId: string | null;
  password: string;
  avatarUri?: string | null;
}

interface AdminUserResponse {
  profile: ProfileRow;
}

async function callAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getCurrentAccessToken();
  if (!token) throw new Error('Your session has expired. Sign in again.');
  return supabaseRequest<T>('/functions/v1/admin-users', {
    method: 'POST',
    token,
    body,
  });
}

export async function createUser(admin: User, input: CreateUserInput): Promise<string | null> {
  const policyError = validatePasswordPolicy(input.password);
  if (policyError) return policyError;
  try {
    const result = await callAdminUsers<AdminUserResponse>({
      action: 'create',
      username: input.username.trim(),
      email: input.email.trim().toLowerCase(),
      full_name: input.fullName.trim(),
      role: input.role,
      facility_id: input.facilityId,
      password: input.password,
    });
    const user = { ...mapUser(result.profile), avatarUri: input.avatarUri ?? null };
    cacheUser(user);
    if (input.avatarUri) {
      db.runSync('UPDATE media_assets SET owner_id = ? WHERE uri = ?', [user.id, input.avatarUri]);
    }
    logAudit(admin, 'USER_CREATED', `Created ${input.role} account: ${input.username}`);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Unable to create the account.';
  }
}

export async function setUserStatus(
  admin: User,
  userId: string,
  status: 'active' | 'suspended'
): Promise<void> {
  await callAdminUsers({ action: 'status', user_id: userId, status });
  db.runSync('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
  logAudit(admin, status === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED', `User ${userId}`);
}

export async function adminResetPassword(
  admin: User,
  userId: string,
  newPassword: string
): Promise<string | null> {
  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) return policyError;
  try {
    await callAdminUsers({ action: 'reset_password', user_id: userId, password: newPassword });
    logAudit(admin, 'PASSWORD_RESET_BY_ADMIN', `Password reset for user ${userId}`);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Unable to reset this password.';
  }
}
