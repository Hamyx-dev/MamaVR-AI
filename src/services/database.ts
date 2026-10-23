/**
 * Offline-first data layer (Chapter 9.10).
 * All records are written to the encrypted-at-rest local SQLite database first
 * and flagged `pending` until the Sync Manager confirms cloud replication.
 */
import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('mamavr.db');

export function initDatabase(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      logo_uri TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      facility_id TEXT REFERENCES facilities(id),
      avatar_uri TEXT,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      facility_id TEXT REFERENCES facilities(id),
      photo_uri TEXT,
      full_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      emergency_contact_name TEXT NOT NULL DEFAULT '',
      emergency_contact_phone TEXT NOT NULL DEFAULT '',
      national_id TEXT,
      nhis_number TEXT,
      gravidity INTEGER,
      parity INTEGER,
      lmp TEXT,
      medical_history TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS anc_visits (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      visit_date TEXT NOT NULL,
      gestational_age_weeks INTEGER,
      vitals TEXT NOT NULL DEFAULT '{}',
      symptoms TEXT NOT NULL DEFAULT '[]',
      fetal TEXT NOT NULL DEFAULT '{}',
      labs TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES anc_visits(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      overall_risk TEXT NOT NULL,
      findings TEXT NOT NULL DEFAULT '[]',
      missing_data TEXT NOT NULL DEFAULT '[]',
      confidence INTEGER NOT NULL,
      recommended_vr_module_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      visit_id TEXT,
      assessment_id TEXT,
      reason TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      referral_date TEXT NOT NULL,
      receiving_facility TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      visit_id TEXT,
      due_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'Routine ANC',
      status TEXT NOT NULL DEFAULT 'scheduled',
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS vr_modules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      key_messages TEXT NOT NULL DEFAULT '[]',
      duration_minutes INTEGER NOT NULL DEFAULT 5,
      video_uri TEXT,
      thumbnail_uri TEXT,
      languages TEXT NOT NULL DEFAULT '["en"]',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS vr_sessions (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES vr_modules(id),
      patient_id TEXT,
      visit_id TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      completed INTEGER NOT NULL DEFAULT 0,
      progress_percent INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS vr_lesson_media (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES vr_modules(id) ON DELETE CASCADE,
      language TEXT NOT NULL,
      video_uri TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(module_id, language)
    );

    CREATE TABLE IF NOT EXISTS education_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      module_id TEXT NOT NULL REFERENCES vr_modules(id),
      language TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      location TEXT NOT NULL DEFAULT '',
      max_capacity INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'scheduled',
      facility_id TEXT NOT NULL REFERENCES facilities(id),
      follow_up_to_id TEXT REFERENCES education_sessions(id),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS education_session_attendance (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES education_sessions(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      status TEXT NOT NULL DEFAULT 'unmarked',
      marked_by TEXT,
      marked_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(session_id, patient_id)
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      uri TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      owner_type TEXT NOT NULL,
      owner_id TEXT,
      size_bytes INTEGER,
      uploaded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      remote_path TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT NOT NULL DEFAULT '',
      facility_id TEXT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      qualification TEXT NOT NULL DEFAULT '',
      responsibilities TEXT NOT NULL DEFAULT '[]',
      photo_uri TEXT,
      is_lead INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branding_settings (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
    CREATE INDEX IF NOT EXISTS idx_visits_patient ON anc_visits(patient_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_patient ON assessments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_education_sessions_date ON education_sessions(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_education_attendance_patient ON education_session_attendance(patient_id);
  `);

  ensureColumn('facilities', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('follow_ups', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('vr_modules', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('media_assets', 'remote_path', 'TEXT');
  ensureColumn('media_assets', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('audit_logs', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('team_members', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('team_members', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('vr_lesson_media', 'sync_status', "TEXT NOT NULL DEFAULT 'pending'");
  db.runSync(
    `INSERT OR IGNORE INTO branding_settings (id, value, sync_status)
     SELECT key, value, 'pending' FROM app_settings WHERE key LIKE 'branding.%'`
  );
  db.runSync(
    `INSERT OR IGNORE INTO vr_lesson_media (id, module_id, language, video_uri, created_at, sync_status)
     SELECT id || ':en', id, 'en', video_uri, created_at, 'pending'
     FROM vr_modules WHERE video_uri IS NOT NULL AND video_uri != ''`
  );
  db.runSync("UPDATE users SET password_hash = '', salt = '' WHERE password_hash != '' OR salt != ''");
}

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getSetting(key: string): string | null {
  try {
    const row = db.getFirstSync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  } catch {
    // The settings table may not exist yet on the very first launch,
    // before initDatabase() has run. Treat that as "no value stored".
    return null;
  }
}

export function setSetting(key: string, value: string): void {
  db.runSync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}
