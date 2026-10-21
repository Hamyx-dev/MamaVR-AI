# Mama Care Number and Referral Handoff Plan

## Purpose

Help a pregnant patient move between a CHPS compound, health centre, or hospital without depending on a paper referral or expecting her to remember and repeat her full clinical history. The receiving health worker should be able to securely retrieve the referral information needed to continue care.

## Recommended approach

Use a randomly generated, opaque **Mama Care Number** as a patient-record reference. Offer it as readable text and as an optional QR code containing the exact same reference.

**The number and QR code must not contain patient details.** They must not encode names, dates of birth, phone numbers, symptoms, diagnoses, facility names, or other personal or clinical data. A QR code is only another way to enter the reference; it is not a separate security mechanism.

The reference is not a password and must never grant access by itself. A receiving health worker must sign in, have the appropriate role, and have a valid care-related referral handoff before viewing protected information. Do not expose a public patient lookup endpoint.

## Proposed health-worker flow

1. At registration, the app creates a collision-resistant, random Mama Care Number and associates it with the patient record. The number remains stable across visits and referrals.
2. At an ANC visit, the health worker records findings as usual. The offline-first app saves the visit locally.
3. If referral is needed, the health worker creates a referral handoff linked to the patient, source facility, destination facility when known, relevant visit/assessment, and a limited summary needed for continuity of care.
4. The app displays the Mama Care Number as text and offers an optional QR. The patient can read the number aloud or show the QR; no paper is required by the digital flow.
5. At the receiving facility, an authenticated worker enters the number or scans the QR. The app checks the referral and the worker's authorization before showing only the information permitted for that handoff.
6. The receiving worker records arrival and the outcome. The referral status becomes visible to authorized staff at the source facility so they can continue follow-up.
7. Record access and referral state changes in the audit trail.

## Lost-number recovery

Do not regenerate a patient's stable Mama Care Number simply because it was forgotten or lost. Recovery should find the existing record and show the existing number only after a health worker verifies the patient's identity using locally appropriate details and, where possible, the originating facility or a trusted contact. Recovery must not silently create a duplicate patient.

The fallback search must be staff-only, access-controlled, audited, and should return the minimum information needed to distinguish likely matches. Avoid relying on a phone number as the only recovery method because some patients may not have reliable or personal phone access.

## Privacy and security requirements

- Generate a random, non-sequential, non-semantic identifier with sufficient entropy; do not derive it from a database row number or patient attributes.
- Treat the identifier as sensitive personal data even though it contains no readable health information.
- Require authenticated staff access and enforce role, facility, and referral-specific authorization on the server with Supabase Row Level Security (RLS). Hiding screens in the app is not authorization.
- Keep cross-facility access limited to the active referral and the minimum necessary clinical information; do not grant blanket access to the patient's entire history by knowing the number.
- Make the optional QR encode only the opaque identifier. Do not put a Supabase URL, access token, service key, or patient/clinical details in it.
- Rate-limit and audit reference lookups; use generic responses where needed to avoid confirming whether an arbitrary number belongs to a patient.
- Use TLS, protect Supabase credentials, and keep service-role credentials only in trusted server-side environments.
- Define identity-verification, retention, revocation, and incident-response procedures with local health and data-protection stakeholders.
- The existing local SQLite store is not SQLCipher-encrypted. Assess and implement device-level protections before using real patient data in production.

## Offline and connectivity behavior

Patient registration and visit documentation should continue offline. Cloud handoff between different facilities cannot be assumed to work while disconnected: the source facility must synchronize the referral before the destination can retrieve it online. Show a clear sync state and do not report a referral as delivered until the server confirms it.

If the destination has no connection, the app should clearly explain that the digital handoff is not yet available and follow an approved local emergency/referral procedure. A future offline-to-offline transfer mechanism would need a separate security and operational design; it is not part of the first release.

## Delivery phases

### Phase 1: Identifier and local workflow

- Add a Mama Care Number to the patient model and local database.
- Generate it securely at registration and keep it stable.
- Show, copy, and search by the number.
- Add optional QR display/scan using only the opaque number.
- Add tests for generation, collisions, persistence, search, and QR contents.

### Phase 2: Referral handoff

- Define the referral handoff fields, destination, expiry/revocation behavior, and permitted summary with clinical stakeholders.
- Add a Supabase migration for referral-handoff data and any required patient identifier field, indexes, constraints, and audit data.
- Add narrowly scoped RLS policies for the referring and receiving facilities.
- Implement authorized lookup by Mama Care Number, arrival acknowledgement, status updates, and source-facility follow-up.
- Test unauthorized, wrong-facility, revoked, expired, duplicate, and valid handoffs.

### Phase 3: Recovery and operational validation

- Build staff-mediated lost-number recovery with identity verification and duplicate prevention.
- Validate usability with health workers and patients in the intended communities, including low-literacy, no-personal-phone, and intermittent-network scenarios.
- Complete a privacy/security review and clinical review before a pilot with real patient information.

## Success criteria

- A health worker can register or find the same patient using the Mama Care Number without creating a duplicate.
- An optional QR contains exactly the same opaque identifier and no other personal or clinical information.
- A receiving worker can retrieve only an authorized, active referral and the minimum necessary handoff information.
- Knowing or guessing a Mama Care Number alone never grants access.
- Lost-number recovery is staff-mediated, verified, audited, and returns the existing patient record.
- Offline work is preserved; the app clearly distinguishes locally saved referrals from referrals confirmed in the cloud.
- The end-to-end flow is understandable and usable in field testing with the intended users.

## Current implementation boundary

The app currently has patient records, ANC visits, assessments, referrals, Supabase Auth, facility-scoped RLS, and offline-first synchronization. It does **not** yet implement Mama Care Numbers, QR generation/scanning for referrals, patient-number lookup, referral-specific cross-facility authorization, or lost-number recovery. The existing RLS is facility-scoped, so cross-facility handoff requires a deliberate server-side schema and policy change before the feature can work safely.
