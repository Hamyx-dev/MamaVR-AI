# MamaVR AI

**An AI-Powered Clinical Decision Support and Virtual Reality Platform for Maternal and Child Health**

MamaVR AI is an offline-first digital maternal healthcare platform that supports Community Health
Officers, nurses, midwives and doctors throughout routine antenatal care (ANC). It combines
explainable, rule-based clinical decision support built on WHO antenatal care recommendations,
automated antenatal calculations, immersive VR patient education, and secure offline storage with
cloud synchronization.

> Decision support only — healthcare professionals retain full responsibility for every clinical
> decision. The platform never provides a definitive diagnosis.

## Feature Overview

| Area | Capabilities |
|---|---|
| **Authentication** | Supabase Auth email/password sign-in, role-based access control (Administrator / Healthcare Worker), refreshable sessions, email password recovery, full audit trail |
| **Patient Management** | Registration with **photo upload**, multi-key search (name, phone, ID, NHIS), pregnancy & medical history, ANC visit records |
| **Clinical Calculations** | Automatic gestational age, EDD (Naegele's rule), BMI, maternal age, WHO eight-contact review scheduling |
| **AI Decision Support** | Deterministic, explainable rule engine (pre-eclampsia, eclampsia, anaemia, bleeding, fever/malaria, fetal compromise, gestational diabetes, obstetric history, maternal age, BMI). Every alert lists evidence, explanation, recommended actions, guideline source and a data-completeness confidence indicator |
| **VR Education** | Seven built-in modules (§7.4) with **admin-uploaded lesson videos and thumbnails**, immersive full-screen player, play/pause/replay, subtitles, language switching (English/Dagbani), progress tracking, guided-narration fallback when no video is uploaded yet |
| **Referrals & Follow-up** | Auto-populated referral forms from AI assessments, WHO-schedule follow-up generation, overdue alerts |
| **Administration** | User management (create/suspend/reactivate/reset password, **avatar upload**), facility management (**logo upload**), VR content manager (**video/thumbnail upload**, publish new modules), analytics dashboard, audit logs, **branding logo upload** |
| **Offline-First Sync** | Records are stored locally in SQLite first, flagged `pending`, then synchronized bidirectionally with Supabase Postgres (REST) and private Storage |

## How the App Is Used

MamaVR AI is designed primarily for a trained health worker to use with a patient; the patient
does not need to own a phone or operate the app.

1. A health worker signs in and selects or registers a patient.
2. During an antenatal visit, the worker records history, symptoms, observations and relevant
   measurements.
3. The app calculates pregnancy dates and runs its local, rule-based decision-support checks.
   It displays risk findings, the evidence behind them, and suggested next steps for the worker
   to review.
4. The worker may schedule follow-up, document a referral, or open a related education lesson
   with the patient.
5. Records and media are saved on the device first. When connected, the worker can synchronize
   updates with the configured Supabase project.

Referrals are currently recorded in the app and synchronized. A cross-facility referral lookup,
patient-issued referral code, QR handoff, and receiving-facility acknowledgement are not currently
implemented.

## AI and Clinical Decision Support

The app's "AI" is a deterministic, explainable rules engine that runs on the device. It evaluates
the patient and visit data entered by the worker against coded clinical rules, then shows findings,
supporting evidence, guideline references and suggested actions. It is not a trained machine
learning model, does not call ChatGPT or Groq, and does not replace a clinician's judgement.
Missing information can affect the completeness indicator and the usefulness of an assessment.

Clinical rules and educational materials require review and approval by qualified Ghanaian
maternal-health professionals before real-world clinical deployment.

## VR Education: Current Scope

The app includes seven lesson records and a full-screen video player. Administrators can add
lesson videos and thumbnails in **Admin → VR Content Manager**. Video files are selected from a
device, kept in app storage, and queued for upload to Supabase Storage when synchronization runs.
Once a video has been synchronized and downloaded onto a worker's device, it can be played offline.

No lesson video files are bundled with the app by default. When a lesson has no video, its player
shows the key messages as timed text steps; this fallback is not spoken narration. The current
player displays regular video full-screen; it is not a 360-degree or stereoscopic headset VR
player. Although lessons list English and Dagbani as supported languages, the lesson text and
uploaded videos need translated content before a Dagbani lesson is actually available.

## Media Upload Design

All images, logos and videos flow through one pipeline:

```
Camera / Library picker  →  Media Manager (services/media.ts)
                             • copies file into private app storage
                             • registers it in the media_assets table
                             • queues it for cloud upload (uploaded = 0)
                          →  MediaPicker component (components/MediaPicker.tsx)
                             • consistent UI: preview, upload, camera, remove
                          →  Sync Manager (services/sync.ts)
                             • uploads pending files to private Supabase Storage
                             • synchronizes queued records and downloads cloud updates
```

Upload points:

- **Patient photo** — registration form and patient record (camera or library)
- **Facility logo** — facility management; shown on dashboards and referral forms
- **Application logo** — administrator branding; shown on splash, login and dashboards
- **Staff avatar** — profile screen and admin user creation
- **VR lesson video + thumbnail** — VR Content Manager; plays fully offline once uploaded

## Technology Stack

| Component | Technology |
|---|---|
| Mobile app | React Native (Expo SDK 57) |
| Language | TypeScript (strict) |
| Local database | SQLite (`expo-sqlite`) |
| Media | `expo-image-picker`, `expo-file-system`, `expo-video` |
| Authentication | Supabase Auth (email/password), refreshable sessions, server-side administrator account provisioning |
| Security | Supabase Row Level Security, private Storage bucket and audit logging; local SQLite is not SQLCipher-encrypted |
| Navigation | React Navigation (native stack + bottom tabs) |
| Cloud sync | Supabase REST + private Storage via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

## Project Structure

```
src/
├── ai/               # Explainable rule engine (Chapter 6)
├── components/       # Design system (Chapter 8) + MediaPicker
├── features/
│   ├── authentication/   # Splash, Login, Forgot Password
│   ├── dashboard/        # Healthcare worker dashboard
│   ├── patients/         # Search, registration, record, high-risk, follow-ups
│   ├── anc/              # ANC consultation (vitals/symptoms/fetal/labs) + summary
│   ├── ai/               # AI assessment screen (risk meter, evidence, actions)
│   ├── vr/               # VR library + immersive player
│   ├── referrals/        # Referral form
│   ├── notifications/    # Colour-coded alerts
│   ├── profile/          # Profile, avatar upload, dark mode, password
│   └── admin/            # Users, facilities, VR content, audit logs, branding
├── hooks/            # Auth context
├── navigation/       # Role-based navigators
├── services/         # SQLite, auth, patients, visits, assessments, referrals,
│                     # vr, media (uploads), sync, audit, facilities, users,
│                     # branding, seed, Supabase Auth/REST
├── theme/            # Palette, typography, light/dark themes
├── types/            # Shared domain models
└── utils/            # Clinical calculations (GA, EDD, BMI, WHO review dates)
```

## Getting Started

```bash
npm install
npm start          # Expo dev server — press "a" for Android
npm run typecheck  # TypeScript validation
```

### Supabase setup

1. Create a Supabase project and apply [`supabase/migrations/202610210001_initial_schema.sql`](./supabase/migrations/202610210001_initial_schema.sql) in the Supabase SQL Editor.
2. Add the project URL and anon/public key to the root `.env` file:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

3. Restart Expo after saving `.env` (`npx expo start -c`).
4. Disable public sign-ups in Supabase **Authentication → Providers → Email**. Create the first user in Supabase **Authentication → Users**. The migration automatically creates a profile. Promote that account to administrator in the SQL Editor (replace the email):

```sql
update public.profiles set role = 'admin'
where email = 'admin@your-facility.org';
```

5. Deploy the user-management Edge Function. Its service-role secret must remain in Supabase and must never be added to the app:

```bash
supabase link --project-ref <project-ref>
supabase functions deploy admin-users
```

6. In Supabase Storage, ensure the private `media` bucket and its access policies are configured
   according to the migration before uploading media.
7. Sign in with the administrator's email, create facilities, then create healthcare-worker
   accounts and assign each to the correct facility. Use **Sync Now / Check for Updates** to
   upload local changes and download cloud records.

The anon/publishable key is intended for client apps; the migration's Row Level Security policies enforce database access. Never put a `service_role` key in `.env` or a mobile build. Add `mamavr://reset-password` to Supabase Auth's allowed redirect URLs for password recovery. The recovery link is handled by the app and opens a screen to choose a new password.

Local records remain available offline after sign-in and queue changes until synchronization. First-time sign-in requires a network connection. Do not use real patient information until policies, account provisioning, retention, backups and local-device protections are reviewed for your deployment.

## Security and Data Protection

- Supabase Auth handles sign-in; the app uses the public/anon client key and authenticated user
  tokens. The Supabase service-role key is server-only and must never be included in the app,
  `.env`, screenshots, or a Git commit.
- Database Row Level Security (RLS) is intended to restrict patient information to the user's
  facility, with administrator access managed through an active admin profile. Storage is
  intended to use a private bucket with authenticated access rules. Review and test the policies
  against your deployment before handling real patient data.
- `.env` is ignored by Git. Commit only placeholder configuration names and examples, never
  project credentials, access tokens, or patient records.
- SQLite and the saved mobile auth session are not protected by SQLCipher or a dedicated secrets
  vault in this version. Device access controls, encryption at rest, backup/retention rules,
  privacy governance and clinical validation are required before production use.

## Clinical Safety & Governance

- Rule logic is derived from the WHO Recommendations on Antenatal Care (2016), WHO danger-sign
  guidance and Ghana Health Service protocols; each finding cites its source.
- Confidence values indicate **data completeness only**, never diagnostic probability.
- Assessments with missing data are clearly flagged (§6.8).
- Every AI assessment, referral, VR launch, login and record change is written to the audit log
  with user, facility, device and timestamp (§10.8).
- Educational VR content should be reviewed by obstetric and public-health experts before
  publication (§7.11).

## Project Team

The MamaVR AI project is led by a multidisciplinary team with expertise in healthcare, software
engineering, cloud computing, and community engagement. The team combines clinical knowledge with
technical innovation to develop a practical, user-centred solution for improving maternal and
child healthcare.

| Team Member | Role | Qualification |
|---|---|---|
| **Abdul Wahab Ibrahim** | Team Lead | BSc Nursing |
| **Osman Abdul-Wahab** | Technical Lead | AWS Cloud Architect / Software Engineer |
| **Adams Rashida** | Communications & Outreach Officer | BSc Public Health Nursing |

```
                MamaVR AI Team
              Abdul Wahab Ibrahim
                   Team Lead
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
 Osman Abdul-Wahab             Adams Rashida
   Technical Lead        Communications & Outreach
```

**Abdul Wahab Ibrahim — Team Lead** (BSc Nursing): overall project leadership and coordination,
clinical oversight of maternal health workflows, product vision and strategy, stakeholder
engagement and partnerships, AI clinical rule validation, and monitoring of implementation and
quality assurance.

**Osman Abdul-Wahab — Technical Lead** (AWS Cloud Architect / Software Engineer): software
architecture design, mobile application development, backend API development, cloud infrastructure
and deployment, database architecture, security implementation, and system integration and
maintenance.

**Adams Rashida — Communications & Outreach Officer** (BSc Public Health Nursing): community
engagement, user education and awareness, stakeholder communication, health promotion content
development, feedback collection during pilot implementation, and coordination of outreach and
dissemination activities.

Team profiles live in the app under **Profile → Project Team** (and on the Administrator
dashboard). Administrators upload each member's professional passport photograph directly on that
screen — the photos flow through the same Media Manager pipeline as all other uploads and replace
the "[Insert Photo Here]" placeholders from the project document.

## Compliance Notes

Designed with the Ghana Data Protection Act, 2012 (Act 843) in mind: minimum-necessary data
collection, facility-scoped Row Level Security, local-first storage and audit trails. Local SQLite
is not encrypted with SQLCipher; production deployments must add local database encryption, device
controls, backups and a reviewed clinical-data governance process before storing real patient data.
