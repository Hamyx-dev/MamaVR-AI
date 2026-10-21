/**
 * Application branding (§8.20): administrators can upload the organisation's
 * logo, which appears on the splash screen, login screen and dashboards.
 */
import { User } from '@/types';
import { logAudit } from './audit';
import { db } from './database';

const LOGO_KEY = 'branding.logoUri';
const NAME_KEY = 'branding.appName';

export function getBrandLogoUri(): string | null {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM branding_settings WHERE id = ?',
    [LOGO_KEY]
  );
  return row?.value || null;
}

export function setBrandLogoUri(admin: User, uri: string | null): void {
  db.runSync(
    `INSERT INTO branding_settings (id, value, sync_status) VALUES (?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET value = excluded.value, sync_status = 'pending'`,
    [LOGO_KEY, uri ?? '']
  );
  logAudit(admin, 'BRANDING_UPDATED', uri ? 'Application logo uploaded' : 'Application logo removed');
}

export function getBrandName(): string {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM branding_settings WHERE id = ?',
    [NAME_KEY]
  );
  return row?.value || 'MamaVR AI';
}
