import * as Crypto from 'expo-crypto';

import {
  AttendanceStatus,
  EducationAttendance,
  EducationSession,
  EducationSessionStatus,
  SyncStatus,
  User,
  VrLanguage,
} from '@/types';
import { logAudit } from './audit';
import { db, nowIso } from './database';
import { getLessonVideoUri } from './vr';

export interface EducationAttendee extends EducationAttendance {
  patientName: string;
}

export interface EducationPatientOption {
  id: string;
  fullName: string;
}

interface SessionRow {
  id: string;
  title: string;
  module_id: string;
  language: VrLanguage;
  scheduled_at: string;
  duration_minutes: number;
  location: string;
  max_capacity: number;
  status: EducationSessionStatus;
  facility_id: string;
  follow_up_to_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
}

interface AttendanceRow {
  id: string;
  session_id: string;
  patient_id: string;
  status: AttendanceStatus;
  marked_by: string | null;
  marked_at: string | null;
  sync_status: SyncStatus;
  patient_name: string;
}

function mapSession(row: SessionRow): EducationSession {
  return {
    id: row.id,
    title: row.title,
    moduleId: row.module_id,
    language: row.language,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    location: row.location,
    maxCapacity: row.max_capacity,
    status: row.status,
    facilityId: row.facility_id,
    followUpToId: row.follow_up_to_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
  };
}

function mapAttendee(row: AttendanceRow): EducationAttendee {
  return {
    id: row.id,
    sessionId: row.session_id,
    patientId: row.patient_id,
    status: row.status,
    markedBy: row.marked_by,
    markedAt: row.marked_at,
    syncStatus: row.sync_status,
    patientName: row.patient_name,
  };
}

function canAccessFacility(user: User, facilityId: string): boolean {
  return user.status === 'active' && (user.role === 'admin' || user.facilityId === facilityId);
}

export function listEducationPatients(
  user: User,
  facilityId: string
): EducationPatientOption[] {
  if (!canAccessFacility(user, facilityId)) return [];
  return db.getAllSync<EducationPatientOption>(
    'SELECT id, full_name AS fullName FROM patients WHERE facility_id = ? ORDER BY full_name COLLATE NOCASE',
    [facilityId]
  );
}

export function listEducationSessions(user: User): EducationSession[] {
  const rows = user.role === 'admin'
    ? db.getAllSync<SessionRow>('SELECT * FROM education_sessions ORDER BY scheduled_at DESC')
    : db.getAllSync<SessionRow>(
        'SELECT * FROM education_sessions WHERE facility_id = ? ORDER BY scheduled_at DESC',
        [user.facilityId ?? '']
      );
  return rows.map(mapSession);
}

export function getEducationSession(user: User, sessionId: string): EducationSession | null {
  const row = db.getFirstSync<SessionRow>(
    'SELECT * FROM education_sessions WHERE id = ?',
    [sessionId]
  );
  return row && canAccessFacility(user, row.facility_id) ? mapSession(row) : null;
}

export function listEducationAttendees(
  user: User,
  sessionId: string
): EducationAttendee[] {
  const session = getEducationSession(user, sessionId);
  if (!session) return [];
  return db.getAllSync<AttendanceRow>(
    `SELECT a.*, p.full_name AS patient_name
     FROM education_session_attendance a
     JOIN patients p ON p.id = a.patient_id AND p.facility_id = ?
     WHERE a.session_id = ?
     ORDER BY p.full_name COLLATE NOCASE`,
    [session.facilityId, sessionId]
  ).map(mapAttendee);
}

export function getFollowUpPatientIds(user: User, sessionId: string): string[] {
  return listEducationAttendees(user, sessionId)
    .filter((attendee) => attendee.status !== 'present')
    .map((attendee) => attendee.patientId);
}

export interface CreateEducationSessionInput {
  title: string;
  moduleId: string;
  language: VrLanguage;
  scheduledAt: string;
  durationMinutes: number;
  location: string;
  maxCapacity: number;
  facilityId: string;
  patientIds: string[];
  followUpToId?: string | null;
}

export function validateEducationSession(
  user: User,
  input: CreateEducationSessionInput
): string | null {
  if (user.status !== 'active') return 'Your account is not active.';
  if (!input.title.trim()) return 'Enter a session title.';
  if (!input.moduleId) return 'Choose an education lesson.';
  if (!getLessonVideoUri(input.moduleId, input.language)) {
    return `The ${input.language === 'dag' ? 'Dagbani' : 'English'} video for this lesson is not available on this device.`;
  }
  const scheduledTime = new Date(input.scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) return 'Enter a valid session date and time.';
  if (scheduledTime <= Date.now()) return 'Choose a future date and time.';
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 240) {
    return 'Session duration must be between 5 and 240 minutes.';
  }
  if (!Number.isInteger(input.maxCapacity) || input.maxCapacity < 1 || input.maxCapacity > 20) {
    return 'Group capacity must be between 1 and 20 women.';
  }
  const patientIds = [...new Set(input.patientIds)];
  if (patientIds.length !== input.patientIds.length) return 'A patient was selected more than once.';
  if (patientIds.length === 0) return 'Select at least one patient for the session.';
  if (patientIds.length > input.maxCapacity || patientIds.length > 20) {
    return `Select no more than ${Math.min(input.maxCapacity, 20)} patients.`;
  }
  if (!input.facilityId || !canAccessFacility(user, input.facilityId)) {
    return 'Select a facility you are authorized to schedule for.';
  }
  const patients = patientIds.map((patientId) =>
    db.getFirstSync<{ facility_id: string | null }>(
      'SELECT facility_id FROM patients WHERE id = ?',
      [patientId]
    )
  );
  if (patients.some((patient) => !patient || patient.facility_id !== input.facilityId)) {
    return 'All selected patients must belong to the session facility.';
  }
  return null;
}

function findScheduleConflict(
  user: User,
  input: CreateEducationSessionInput
): string | null {
  const candidateStart = new Date(input.scheduledAt).getTime();
  const candidateEnd = candidateStart + input.durationMinutes * 60_000;
  const sessions = db.getAllSync<SessionRow>(
    `SELECT * FROM education_sessions
     WHERE facility_id = ? AND status = 'scheduled'`,
    [input.facilityId]
  );
  const selectedPatients = new Set(input.patientIds);

  for (const session of sessions) {
    const existingStart = new Date(session.scheduled_at).getTime();
    const existingEnd = existingStart + session.duration_minutes * 60_000;
    if (candidateStart >= existingEnd || existingStart >= candidateEnd) continue;
    const sameLocation = input.location.trim().toLocaleLowerCase() === session.location.trim().toLocaleLowerCase();
    if (session.created_by === user.id || (sameLocation && input.location.trim())) {
      return 'This facilitator or location already has another session scheduled during that time.';
    }
    const attendeeIds = db.getAllSync<{ patient_id: string }>(
      'SELECT patient_id FROM education_session_attendance WHERE session_id = ?',
      [session.id]
    );
    if (attendeeIds.some((attendee) => selectedPatients.has(attendee.patient_id))) {
      return 'One or more selected patients already have an education session at this time.';
    }
  }
  return null;
}

export function createEducationSession(
  user: User,
  input: CreateEducationSessionInput
): EducationSession {
  const validationError = validateEducationSession(user, input);
  if (validationError) throw new Error(validationError);
  const conflict = findScheduleConflict(user, input);
  if (conflict) throw new Error(conflict);

  const now = nowIso();
  const session: EducationSession = {
    id: Crypto.randomUUID(),
    title: input.title.trim(),
    moduleId: input.moduleId,
    language: input.language,
    scheduledAt: new Date(input.scheduledAt).toISOString(),
    durationMinutes: input.durationMinutes,
    location: input.location.trim(),
    maxCapacity: input.maxCapacity,
    status: 'scheduled',
    facilityId: input.facilityId,
    followUpToId: input.followUpToId ?? null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO education_sessions (
         id, title, module_id, language, scheduled_at, duration_minutes, location,
         max_capacity, status, facility_id, follow_up_to_id, created_by,
         created_at, updated_at, sync_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 'pending')`,
      [
        session.id,
        session.title,
        session.moduleId,
        session.language,
        session.scheduledAt,
        session.durationMinutes,
        session.location,
        session.maxCapacity,
        session.facilityId,
        session.followUpToId,
        session.createdBy,
        session.createdAt,
        session.updatedAt,
      ]
    );
    for (const patientId of input.patientIds) {
      db.runSync(
        `INSERT INTO education_session_attendance
         (id, session_id, patient_id, status, marked_by, marked_at, sync_status)
         VALUES (?, ?, ?, 'unmarked', NULL, NULL, 'pending')`,
        [Crypto.randomUUID(), session.id, patientId]
      );
    }
  });
  logAudit(user, 'EDUCATION_SESSION_CREATED', `Session ${session.id} (${session.language}, ${input.patientIds.length} attendees)`);
  return session;
}

export function updateEducationAttendance(
  user: User,
  sessionId: string,
  patientId: string,
  status: AttendanceStatus
): void {
  if (status === 'unmarked') {
    throw new Error('Attendance must be marked present or absent.');
  }
  const session = getEducationSession(user, sessionId);
  if (!session) throw new Error('Session not found or you do not have access.');
  if (session.status === 'cancelled') throw new Error('Attendance cannot be changed for a cancelled session.');
  const patient = db.getFirstSync<{ facility_id: string | null }>(
    'SELECT facility_id FROM patients WHERE id = ?',
    [patientId]
  );
  if (patient?.facility_id !== session.facilityId) {
    throw new Error('This patient is not part of the session facility.');
  }
  const now = nowIso();
  const result = db.runSync(
    `UPDATE education_session_attendance
     SET status = ?, marked_by = ?, marked_at = ?, sync_status = 'pending'
     WHERE session_id = ? AND patient_id = ?`,
    [status, user.id, now, sessionId, patientId]
  );
  if (result.changes === 0) throw new Error('This patient is not on the session roster.');
  logAudit(user, 'EDUCATION_ATTENDANCE_MARKED', `Session ${sessionId}, patient ${patientId}: ${status}`);
}

export function updateEducationSessionStatus(
  user: User,
  sessionId: string,
  status: EducationSessionStatus
): void {
  const session = getEducationSession(user, sessionId);
  if (!session) throw new Error('Session not found or you do not have access.');
  if (user.role !== 'admin' && session.createdBy !== user.id) {
    throw new Error('Only the session creator or an administrator may update its status.');
  }
  db.runSync(
    "UPDATE education_sessions SET status = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?",
    [status, nowIso(), sessionId]
  );
  logAudit(user, 'EDUCATION_SESSION_UPDATED', `Session ${sessionId}: ${status}`);
}