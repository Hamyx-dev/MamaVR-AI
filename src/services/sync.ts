import * as FileSystem from 'expo-file-system/legacy';
import { SQLiteBindValue } from 'expo-sqlite';

import { User } from '@/types';
import { logAudit } from './audit';
import { db, getSetting, setSetting } from './database';
import {
  countPendingUploads,
  getPendingUploads,
  markUploaded,
} from './media';
import {
  getAccessToken,
  getAnonKey,
  isSupabaseConfigured,
  storageUrl,
  supabaseRequest,
} from './supabase';

const SYNC_TABLES = [
  { name: 'facilities', json: [], booleans: [] },
  { name: 'team_members', json: ['responsibilities'], booleans: ['is_lead'] },
  { name: 'vr_modules', json: ['key_messages', 'languages'], booleans: ['is_builtin'] },
  { name: 'media_assets', json: [], booleans: ['uploaded'] },
  { name: 'branding_settings', json: [], booleans: [] },
  { name: 'patients', json: ['medical_history'], booleans: [] },
  { name: 'anc_visits', json: ['vitals', 'symptoms', 'fetal', 'labs'], booleans: [] },
  { name: 'assessments', json: ['findings', 'missing_data'], booleans: [] },
  { name: 'referrals', json: [], booleans: [] },
  { name: 'follow_ups', json: [], booleans: [] },
  { name: 'vr_sessions', json: [], booleans: ['completed'] },
  { name: 'audit_logs', json: [], booleans: [] },
] as const;

const MEDIA_FIELDS = ['photo_uri', 'logo_uri', 'video_uri', 'thumbnail_uri'] as const;
const JSON_COLUMNS: Record<string, readonly string[]> = Object.fromEntries(
  SYNC_TABLES.map((table) => [table.name, table.json])
);
const BOOLEAN_COLUMNS: Record<string, readonly string[]> = Object.fromEntries(
  SYNC_TABLES.map((table) => [table.name, table.booleans])
);

interface RemoteMediaAsset {
  id: string;
  kind: string;
  uri: string;
  mime_type: string;
  owner_type: string;
  owner_id: string | null;
  size_bytes: number | null;
  uploaded: boolean;
  created_at: string;
}

export interface SyncStatusSummary {
  pendingRecords: number;
  pendingMedia: number;
  cloudConfigured: boolean;
}

export function getSyncStatus(): SyncStatusSummary {
  let pendingRecords = 0;
  for (const { name } of SYNC_TABLES) {
    if (name === 'media_assets') continue;
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${name} WHERE sync_status = 'pending'`
    );
    pendingRecords += row?.n ?? 0;
  }
  return {
    pendingRecords,
    pendingMedia: countPendingUploads(),
    cloudConfigured: isSupabaseConfigured(),
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error('A local record contains invalid JSON and cannot be synchronized.');
  }
}

function isLocalFileUri(value: string): boolean {
  return value.startsWith('file://') || value.startsWith('/');
}

function remoteMediaPath(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri) return null;
  const row = db.getFirstSync<{ remote_path: string | null }>(
    'SELECT remote_path FROM media_assets WHERE uri = ?',
    [uri]
  );
  if (row?.remote_path) return row.remote_path;
  if (isLocalFileUri(uri)) {
    throw new Error('A media file has not uploaded yet. Retry synchronization when connected.');
  }
  return uri;
}

function toRemoteRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sync_status' || (table === 'media_assets' && key === 'remote_path')) continue;
    if (table === 'media_assets' && key === 'uri') {
      output.uri = row.remote_path ?? value;
    } else if (
      table === 'branding_settings' &&
      key === 'value' &&
      row.id === 'branding.logoUri'
    ) {
      output[key] = value === '' ? '' : remoteMediaPath(value);
    } else if ((MEDIA_FIELDS as readonly string[]).includes(key)) {
      output[key] = remoteMediaPath(value);
    } else if ((JSON_COLUMNS[table] ?? []).includes(key)) {
      output[key] = parseJson(value);
    } else if ((BOOLEAN_COLUMNS[table] ?? []).includes(key)) {
      output[key] = value === true || value === 1;
    } else {
      output[key] = value;
    }
  }
  return output;
}

function fromRemoteRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...row, sync_status: 'synced' };
  if (table === 'branding_settings' && row.id === 'branding.logoUri') {
    if (typeof row.value === 'string') {
      const asset = db.getFirstSync<{ uri: string }>(
        'SELECT uri FROM media_assets WHERE remote_path = ?',
        [row.value]
      );
      if (asset) output.value = asset.uri;
    }
  }
  for (const key of JSON_COLUMNS[table] ?? []) {
    output[key] = JSON.stringify(row[key] ?? (key === 'symptoms' || key === 'findings' || key === 'missing_data' || key === 'key_messages' || key === 'languages' || key === 'responsibilities' ? [] : {}));
  }
  for (const key of BOOLEAN_COLUMNS[table] ?? []) {
    output[key] = row[key] ? 1 : 0;
  }
  for (const key of MEDIA_FIELDS) {
    const path = row[key];
    if (typeof path !== 'string' || !path) continue;
    const asset = db.getFirstSync<{ uri: string }>(
      'SELECT uri FROM media_assets WHERE remote_path = ?',
      [path]
    );
    if (asset) output[key] = asset.uri;
  }
  if (table === 'media_assets') {
    output.remote_path = row.uri;
    if (typeof row.id !== 'string') {
      throw new Error('Supabase returned media metadata without a valid ID.');
    }
    const asset = db.getFirstSync<{ uri: string; uploaded: number }>(
      'SELECT uri, uploaded FROM media_assets WHERE id = ?',
      [row.id]
    );
    if (asset?.uploaded) output.uri = asset.uri;
    else output.uri = row.uri;
    output.uploaded = 1;
  }
  return output;
}

function toSqliteValue(value: unknown): SQLiteBindValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

async function uploadPendingMedia(user: User): Promise<number> {
  const assets = getPendingUploads();
  if (!assets.length) return 0;
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in before synchronizing media.');
  const key = await getAnonKey();
  let uploaded = 0;

  for (const asset of assets) {
    const filename = asset.uri.split('/').pop() ?? asset.id;
    const sharedAsset = ['app_logo', 'vr_video', 'vr_thumbnail', 'team_photo'].includes(asset.ownerType);
    let ownerFacilityId: string | null = user.facilityId;
    if (asset.ownerType === 'patient_photo' && asset.ownerId) {
      ownerFacilityId =
        db.getFirstSync<{ facility_id: string | null }>(
          'SELECT facility_id FROM patients WHERE id = ?',
          [asset.ownerId]
        )?.facility_id ?? null;
    } else if (asset.ownerType === 'facility_logo' && asset.ownerId) {
      ownerFacilityId = asset.ownerId;
    } else if (asset.ownerType === 'user_avatar' && asset.ownerId) {
      ownerFacilityId =
        db.getFirstSync<{ facility_id: string | null }>(
          'SELECT facility_id FROM users WHERE id = ?',
          [asset.ownerId]
        )?.facility_id ?? null;
    }
    if (!sharedAsset && !ownerFacilityId && user.role !== 'admin') {
      throw new Error('Assign this account to a facility before uploading its media.');
    }
    const folder = sharedAsset || (!ownerFacilityId && user.role === 'admin')
      ? 'shared'
      : ownerFacilityId ?? user.id;
    const remotePath = `${folder}/${asset.ownerType}/${filename}`;
    const objectUrl = storageUrl(remotePath).replace('/object/authenticated/', '/object/');
    const result = await FileSystem.uploadAsync(objectUrl, asset.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': asset.mimeType,
        'x-upsert': 'true',
      },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Media upload failed for ${asset.ownerType} (HTTP ${result.status}).`);
    }
    markUploaded(asset.id, remotePath);
    uploaded += 1;
  }
  return uploaded;
}

async function syncTable(
  name: string,
  options: { pull?: boolean; ignoreDuplicates?: boolean; push?: boolean } = {}
): Promise<{ pushed: number; pulled: number }> {
  const pending =
    options.push === false
      ? []
      : db.getAllSync<Record<string, unknown>>(
          `SELECT * FROM ${name} WHERE sync_status = 'pending'`
        );
  if (options.push === false) {
    db.runSync(`UPDATE ${name} SET sync_status = 'synced' WHERE sync_status = 'pending'`);
  }
  if (pending.length) {
    const pendingIds = pending.map((row) => {
      if (typeof row.id !== 'string') {
        throw new Error(`A local ${name} record has no valid ID and cannot be synchronized.`);
      }
      return row.id;
    });
    const batchSize = 200;
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const rows = pending.slice(offset, offset + batchSize);
      const ids = pendingIds.slice(offset, offset + batchSize);
      await supabaseRequest(`/rest/v1/${name}?on_conflict=id`, {
        method: 'POST',
        headers: {
          Prefer: `resolution=${options.ignoreDuplicates ? 'ignore-duplicates' : 'merge-duplicates'},return=minimal`,
        },
        body: rows.map((row) => toRemoteRow(name, row)),
      });
      const placeholders = ids.map(() => '?').join(', ');
      db.runSync(
        `UPDATE ${name} SET sync_status = 'synced' WHERE id IN (${placeholders})`,
        ids
      );
    }
  }

  if (options.pull === false) return { pushed: pending.length, pulled: 0 };

  let pulled = 0;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const rows = await supabaseRequest<Record<string, unknown>[]>(
      `/rest/v1/${name}?select=*&order=id.asc&limit=${pageSize}`,
      {
        headers: {
          Range: `${offset}-${offset + pageSize - 1}`,
          'Range-Unit': 'items',
        },
      }
    );
    for (const remoteRow of rows) {
      if (typeof remoteRow.id !== 'string') {
        throw new Error(`Supabase returned a row without a valid ID for ${name}.`);
      }
      const local = db.getFirstSync<{ sync_status: string }>(
        `SELECT sync_status FROM ${name} WHERE id = ?`,
        [remoteRow.id]
      );
      if (local?.sync_status === 'pending') continue;
      const mapped = fromRemoteRow(name, remoteRow);
      const columns = Object.keys(mapped);
      const placeholders = columns.map(() => '?').join(', ');
      const updates = columns
        .filter((column) => column !== 'id')
        .map((column) => `${column} = excluded.${column}`)
        .join(', ');
      db.runSync(
        `INSERT INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updates}`,
        columns.map((column) => toSqliteValue(mapped[column]))
      );
      pulled += 1;
    }
    if (rows.length < pageSize) break;
  }
  return { pushed: pending.length, pulled };
}

async function pullMediaAssets(): Promise<number> {
  const remoteAssets: RemoteMediaAsset[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest<RemoteMediaAsset[]>(
      `/rest/v1/media_assets?select=*&order=id.asc&limit=${pageSize}`,
      {
        headers: {
          Range: `${offset}-${offset + pageSize - 1}`,
          'Range-Unit': 'items',
        },
      }
    );
    remoteAssets.push(...page);
    if (page.length < pageSize) break;
  }
  const directory = `${FileSystem.documentDirectory ?? ''}media/`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  let downloaded = 0;
  const token = await getAccessToken();
  const key = await getAnonKey();
  if (!token) throw new Error('Sign in before downloading media.');

  for (const asset of remoteAssets) {
    const current = db.getFirstSync<{ uri: string; uploaded: number; remote_path: string | null }>(
      'SELECT uri, uploaded, remote_path FROM media_assets WHERE id = ?',
      [asset.id]
    );
    if (current?.uploaded && current.remote_path === asset.uri) {
      const localFile = await FileSystem.getInfoAsync(current.uri);
      if (localFile.exists) continue;
    }
    const extension = asset.uri.split('/').pop()?.split('.').pop() || (asset.kind === 'video' ? 'mp4' : 'jpg');
    const destination = `${directory}${asset.id}.${extension}`;
    const existingFile = await FileSystem.getInfoAsync(destination);
    if (!existingFile.exists) {
      const response = await FileSystem.downloadAsync(storageUrl(asset.uri), destination, {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Media download failed (HTTP ${response.status}).`);
      }
    }
    db.runSync(
      `INSERT INTO media_assets
       (id, kind, uri, mime_type, owner_type, owner_id, size_bytes, uploaded, created_at, remote_path, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'synced')
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind, uri = excluded.uri, mime_type = excluded.mime_type,
         owner_type = excluded.owner_type, owner_id = excluded.owner_id,
         size_bytes = excluded.size_bytes, uploaded = 1, remote_path = excluded.remote_path,
         sync_status = 'synced'`,
      [
        asset.id,
        asset.kind,
        destination,
        asset.mime_type,
        asset.owner_type,
        asset.owner_id,
        asset.size_bytes,
        asset.created_at,
        asset.uri,
      ]
    );
    db.runSync('UPDATE users SET avatar_uri = ? WHERE avatar_uri = ?', [destination, asset.uri]);
    downloaded += 1;
  }
  return downloaded;
}

export type SyncResult =
  | { ok: true; recordsSynced: number; mediaSynced: number }
  | { ok: false; error: string };

export async function syncNow(user: User): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase is not configured. Check the two EXPO_PUBLIC_SUPABASE values in .env and restart Expo.',
    };
  }
  try {
    if (!(await getAccessToken())) {
      return { ok: false, error: 'Sign in to your Supabase account before synchronizing.' };
    }
    const mediaUploaded = await uploadPendingMedia(user);
    let recordsSynced = 0;
    let mediaDownloaded = 0;
    for (const { name } of SYNC_TABLES) {
      const result = await syncTable(name, {
        pull: name !== 'media_assets',
        ignoreDuplicates: name === 'audit_logs',
        push:
          user.role === 'admin' ||
          !['facilities', 'team_members', 'vr_modules', 'branding_settings'].includes(name),
      });
      recordsSynced += result.pushed + result.pulled;
      if (name === 'media_assets') {
        mediaDownloaded += await pullMediaAssets();
      }
    }
    const avatars = db.getAllSync<{ id: string }>('SELECT id FROM users');
    for (const profile of avatars) {
      const settingKey = `profile.avatar.pending.${profile.id}`;
      const pendingAvatar = getSetting(settingKey);
      if (pendingAvatar === null || pendingAvatar === '') continue;
      let avatarUri: string | null;
      try {
        avatarUri = JSON.parse(pendingAvatar) as string | null;
      } catch {
        throw new Error('A queued profile photo update is invalid; clear and reselect the photo.');
      }
      const remotePath = avatarUri ? remoteMediaPath(avatarUri) : null;
      if (profile.id === user.id) {
        await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: { avatar_uri: remotePath },
        });
      } else if (user.role === 'admin') {
        await supabaseRequest('/functions/v1/admin-users', {
          method: 'POST',
          body: { action: 'avatar', user_id: profile.id, avatar_uri: remotePath },
        });
      } else {
        continue;
      }
      setSetting(settingKey, '');
    }
    const totalMediaSynced = mediaUploaded + mediaDownloaded;
    logAudit(
      user,
      'DATA_SYNCHRONIZED',
      `${recordsSynced} records, ${totalMediaSynced} media files`
    );
    return { ok: true, recordsSynced, mediaSynced: totalMediaSynced };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logAudit(user, 'SYNC_FAILED', message);
    return { ok: false, error: `Synchronization failed: ${message}` };
  }
}
