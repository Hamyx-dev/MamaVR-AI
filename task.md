# Mama Care Number and Referral Handoff Tasks

Work through the phases in order. Do not deploy a migration that broadens patient access until its RLS behavior has been reviewed and tested.

## Phase 0 — Confirm workflow and safeguards

- [ ] Confirm with health workers how a referral destination is selected and what information the receiving worker needs.
- [ ] Agree on identity checks for lost-number recovery, including options when the patient has no personal phone or formal ID.
- [ ] Decide referral expiry, cancellation, revocation, and acknowledgement rules.
- [ ] Confirm that the Mama Care Number is an opaque reference, never a credential or container for patient information.
- [ ] Review privacy, clinical, and operational requirements with relevant Ghana/Northern Ghana health stakeholders.

## Phase 1 — Local patient identifier

- [ ] Choose and document a human-readable, random identifier format with sufficient entropy and typo-resistant characters.
- [ ] Add `mama_care_number` to shared patient types and local SQLite schema with a safe migration for existing installations.
- [ ] Generate the identifier using a cryptographically secure random source when a patient is registered.
- [ ] Enforce uniqueness locally and handle the extremely unlikely collision by generating a new number.
- [ ] Preserve the identifier when patient details change; never regenerate it as a routine update.
- [ ] Add the number to patient details and registration success UI in a readable, accessible format.
- [ ] Add exact-number patient search while preserving existing name/phone/ID/NHIS search.
- [ ] Add unit tests for format, uniqueness handling, persistence, stable updates, and search.

## Phase 2 — Optional QR

- [ ] Select a QR generation/scanning approach compatible with the current Expo SDK and target devices.
- [ ] Display and scan the exact same Mama Care Number used by manual entry.
- [ ] Ensure the QR contains only the opaque identifier—no health data, tokens, or private URLs.
- [ ] Provide clear manual entry when camera access is unavailable or scanning fails.
- [ ] Test QR payload contents, invalid codes, damaged/unreadable codes, permissions, and low-end devices.

## Phase 3 — Secure Supabase referral handoff

- [ ] Specify a minimal referral handoff model: patient, source facility, destination facility, linked visit/assessment, status, created/updated timestamps, and expiry/revocation as agreed.
- [ ] Add a versioned Supabase migration for the patient identifier, referral handoff data, uniqueness/index constraints, and required relationships.
- [ ] Design RLS so the source facility and explicitly authorized receiving facility can access only the active referral and approved minimum data.
- [ ] Ensure the patient number alone never grants database or Storage access; do not create an unauthenticated lookup endpoint.
- [ ] If a server-side lookup function is needed, require a valid staff JWT, validate the staff profile/role, enforce rate limits, return minimal data, and audit accesses.
- [ ] Implement patient-number lookup in the app for authorized staff.
- [ ] Add referral arrival acknowledgement and outcome/status updates that synchronize back to the source facility.
- [ ] Keep referrals marked locally pending until Supabase confirms delivery; show clear offline/pending/error states.
- [ ] Add automated or repeatable tests for valid handoff, unauthorized user, unrelated facility, wrong number, revoked/expired referral, duplicate number, and cross-facility data isolation.
- [ ] Review the migration and RLS policies before applying them to the linked Supabase project.

## Phase 4 — Lost-number recovery

- [ ] Implement staff-only search/recovery using agreed patient matching details and originating facility where available.
- [ ] Require identity confirmation before displaying or reissuing the existing Mama Care Number.
- [ ] Prevent duplicate patient creation during recovery and handle multiple possible matches safely.
- [ ] Audit recovery searches and actions; avoid revealing whether arbitrary identifiers exist to unauthorized users.
- [ ] Test patients with no phone, spelling variations, shared names, and uncertain matches.

## Phase 5 — Field validation and release readiness

- [ ] Test referral flow with representative health workers and patients in the intended communities.
- [ ] Check comprehension for low-literacy users, manual code entry, optional scanning, and no-personal-phone use.
- [ ] Test offline registration, deferred synchronization, destination lookup, sync conflict behavior, and recovery.
- [ ] Review access logs, account suspension behavior, rate limiting, backups, retention, and incident handling.
- [ ] Address local device/database protection; current SQLite storage is not SQLCipher-encrypted.
- [ ] Complete clinical-content and privacy/security sign-off before using real patient data.
- [ ] Update user documentation and deployment instructions after implementation.
