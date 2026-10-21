import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SESSION_KEY = 'mamavr.supabase.session';

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
}

interface AuthResponse extends Omit<SupabaseSession, 'expires_at'> {
  expires_at?: number;
  expires_in?: number;
}

export class SupabaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SupabaseRequestError';
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function requireConfig(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart Expo.');
  }
  return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${options.token ?? key}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    let message = `Supabase request failed (HTTP ${response.status}).`;
    try {
      const detail = (await response.json()) as { message?: string; msg?: string; error_description?: string };
      message = detail.message ?? detail.msg ?? detail.error_description ?? message;
    } catch {
      // Use the HTTP status when the response body is not JSON.
    }
    throw new SupabaseRequestError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withExpiry(session: AuthResponse): SupabaseSession {
  return {
    ...session,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
  };
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const result = await request<AuthResponse>('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  const session = withExpiry(result);
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  const redirectTo = encodeURIComponent('mamavr://reset-password');
  await authRequest(
    `/auth/v1/recover?redirect_to=${redirectTo}`,
    { method: 'POST', body: { email } }
  );
}

export async function getStoredSession(): Promise<SupabaseSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as SupabaseSession;
    if (!session.access_token || !session.refresh_token || !session.user?.id) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session.access_token;

  try {
    const refreshed = await request<AuthResponse>('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    const nextSession = withExpiry(refreshed);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    return nextSession.access_token;
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 400) {
      await clearSession();
    }
    throw error;
  }
}

export async function supabaseRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const token = options.token === undefined ? await getAccessToken() : options.token;
  return request<T>(path, { ...options, token });
}

export async function authRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  return request<T>(path, options);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function signOutFromSupabase(): Promise<void> {
  try {
    const token = await getAccessToken();
    if (token) await authRequest('/auth/v1/logout', { method: 'POST', token });
  } finally {
    await clearSession();
  }
}

export function storageUrl(objectPath: string): string {
  const { url } = requireConfig();
  return `${url}/storage/v1/object/authenticated/media/${objectPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

export async function getAnonKey(): Promise<string> {
  return requireConfig().key;
}
