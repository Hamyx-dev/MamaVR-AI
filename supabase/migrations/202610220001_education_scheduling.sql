create table if not exists public.vr_lesson_media (
  id text primary key,
  module_id text not null references public.vr_modules(id) on delete cascade,
  language text not null,
  video_uri text,
  created_at timestamptz not null default now(),
  unique (module_id, language)
);

insert into public.vr_lesson_media (id, module_id, language, video_uri, created_at)
select id || ':en', id, 'en', video_uri, created_at
from public.vr_modules
where video_uri is not null and video_uri <> ''
on conflict (module_id, language) do nothing;

create table if not exists public.education_sessions (
  id text primary key,
  title text not null,
  module_id text not null references public.vr_modules(id),
  language text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 240),
  location text not null default '',
  max_capacity integer not null default 20 check (max_capacity between 1 and 20),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  facility_id text not null references public.facilities(id),
  follow_up_to_id text references public.education_sessions(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.education_session_attendance (
  id text primary key,
  session_id text not null references public.education_sessions(id) on delete cascade,
  patient_id text not null references public.patients(id),
  status text not null default 'unmarked' check (status in ('unmarked', 'present', 'absent')),
  marked_by uuid references auth.users(id),
  marked_at timestamptz,
  unique (session_id, patient_id)
);

create index if not exists education_sessions_facility_date_idx
  on public.education_sessions(facility_id, scheduled_at);
create index if not exists education_attendance_patient_idx
  on public.education_session_attendance(patient_id);

grant select, insert, update, delete on
  public.vr_lesson_media, public.education_sessions, public.education_session_attendance
to authenticated;

alter table public.vr_lesson_media enable row level security;
alter table public.education_sessions enable row level security;
alter table public.education_session_attendance enable row level security;

create policy "authenticated users read lesson media" on public.vr_lesson_media
  for select to authenticated using (true);
create policy "admins manage lesson media" on public.vr_lesson_media
  for all to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "facility members read education sessions" on public.education_sessions
  for select to authenticated
  using (public.current_user_is_admin() or facility_id = public.current_user_facility_id());
create policy "facility members create education sessions" on public.education_sessions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (public.current_user_is_admin() or facility_id = public.current_user_facility_id())
    and exists (
      select 1 from public.vr_lesson_media m
      where m.module_id = education_sessions.module_id
        and m.language = education_sessions.language
        and m.video_uri is not null and m.video_uri <> ''
    )
  );
create policy "facility members update own education sessions" on public.education_sessions
  for update to authenticated
  using (
    public.current_user_is_admin()
    or (facility_id = public.current_user_facility_id() and created_by = (select auth.uid()))
  )
  with check (
    (public.current_user_is_admin()
      or (facility_id = public.current_user_facility_id() and created_by = (select auth.uid())))
    and exists (
      select 1 from public.vr_lesson_media m
      where m.module_id = education_sessions.module_id
        and m.language = education_sessions.language
        and m.video_uri is not null and m.video_uri <> ''
    )
  );

create policy "facility members read session attendance" on public.education_session_attendance
  for select to authenticated
  using (
    exists (
      select 1 from public.education_sessions s
      join public.patients p on p.id = education_session_attendance.patient_id
        and p.facility_id = s.facility_id
      where s.id = education_session_attendance.session_id
        and (public.current_user_is_admin() or s.facility_id = public.current_user_facility_id())
    )
  );
create policy "facility members create session attendance" on public.education_session_attendance
  for insert to authenticated
  with check (
    (marked_by is null or marked_by = (select auth.uid()))
    and exists (
      select 1 from public.education_sessions s
      join public.patients p on p.id = education_session_attendance.patient_id
        and p.facility_id = s.facility_id
      where s.id = education_session_attendance.session_id
        and (public.current_user_is_admin() or s.facility_id = public.current_user_facility_id())
    )
  );
create policy "facility members update session attendance" on public.education_session_attendance
  for update to authenticated
  using (
    exists (
      select 1 from public.education_sessions s
      join public.patients p on p.id = education_session_attendance.patient_id
        and p.facility_id = s.facility_id
      where s.id = education_session_attendance.session_id
        and (public.current_user_is_admin() or s.facility_id = public.current_user_facility_id())
    )
  )
  with check (
    (marked_by is null or marked_by = (select auth.uid()))
    and exists (
      select 1 from public.education_sessions s
      join public.patients p on p.id = education_session_attendance.patient_id
        and p.facility_id = s.facility_id
      where s.id = education_session_attendance.session_id
        and (public.current_user_is_admin() or s.facility_id = public.current_user_facility_id())
    )
  );