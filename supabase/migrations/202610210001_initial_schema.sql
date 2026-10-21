create table if not exists public.facilities (
  id text primary key,
  name text not null,
  type text not null check (type in ('hospital', 'health_centre', 'chps_compound')),
  district text not null default '',
  region text not null default '',
  logo_uri text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  full_name text not null,
  role text not null default 'healthcare_worker' check (role in ('admin', 'healthcare_worker')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  facility_id text references public.facilities(id),
  avatar_uri text,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id text primary key,
  facility_id text references public.facilities(id),
  photo_uri text,
  full_name text not null,
  date_of_birth date not null,
  phone text not null default '',
  address text not null default '',
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  national_id text,
  nhis_number text,
  gravidity integer,
  parity integer,
  lmp date,
  medical_history jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anc_visits (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  visit_date date not null,
  gestational_age_weeks integer,
  vitals jsonb not null default '{}'::jsonb,
  symptoms jsonb not null default '[]'::jsonb,
  fetal jsonb not null default '{}'::jsonb,
  labs jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id text primary key,
  visit_id text not null references public.anc_visits(id) on delete cascade,
  patient_id text not null references public.patients(id) on delete cascade,
  overall_risk text not null check (overall_risk in ('low', 'moderate', 'high')),
  findings jsonb not null default '[]'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  confidence integer not null check (confidence between 0 and 100),
  recommended_vr_module_id text not null,
  generated_at timestamptz not null default now(),
  generated_by uuid not null references auth.users(id)
);

create table if not exists public.referrals (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  visit_id text references public.anc_visits(id) on delete set null,
  assessment_id text references public.assessments(id) on delete set null,
  reason text not null,
  risk_level text not null check (risk_level in ('low', 'moderate', 'high')),
  notes text not null default '',
  referral_date date not null,
  receiving_facility text not null default '',
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_by uuid not null references auth.users(id)
);

create table if not exists public.follow_ups (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  visit_id text references public.anc_visits(id) on delete set null,
  due_date date not null,
  reason text not null default 'Routine ANC',
  status text not null default 'scheduled' check (status in ('scheduled', 'attended', 'missed'))
);

create table if not exists public.vr_modules (
  id text primary key,
  title text not null,
  purpose text not null default '',
  key_messages jsonb not null default '[]'::jsonb,
  duration_minutes integer not null default 5,
  video_uri text,
  thumbnail_uri text,
  languages jsonb not null default '["en"]'::jsonb,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.vr_sessions (
  id text primary key,
  module_id text not null references public.vr_modules(id),
  patient_id text references public.patients(id) on delete set null,
  visit_id text references public.anc_visits(id) on delete set null,
  language text not null default 'en',
  completed boolean not null default false,
  progress_percent integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.team_members (
  id text primary key,
  name text not null,
  role text not null,
  qualification text not null default '',
  responsibilities jsonb not null default '[]'::jsonb,
  photo_uri text,
  is_lead boolean not null default false,
  display_order integer not null default 0
);

create table if not exists public.audit_logs (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  username text not null default '',
  facility_id text references public.facilities(id) on delete set null,
  action text not null,
  detail text not null default '',
  device_id text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id text primary key,
  kind text not null check (kind in ('image', 'video')),
  uri text not null,
  mime_type text not null default '',
  owner_type text not null,
  owner_id text,
  size_bytes bigint,
  uploaded boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.branding_settings (
  id text primary key,
  value text not null
);

grant select, insert, update, delete on
  public.facilities, public.patients, public.anc_visits, public.assessments,
  public.referrals, public.follow_ups, public.vr_modules, public.vr_sessions,
  public.team_members, public.audit_logs, public.media_assets, public.branding_settings
to authenticated;
grant select on public.profiles to authenticated;

create index if not exists patients_facility_id_idx on public.patients(facility_id);
create index if not exists patients_full_name_idx on public.patients(full_name);
create index if not exists anc_visits_patient_id_idx on public.anc_visits(patient_id);
create index if not exists assessments_patient_id_idx on public.assessments(patient_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

create or replace function public.current_user_facility_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.facility_id from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active';
$$;

create or replace function public.can_access_patient(target_patient_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.patients p
    where p.id = target_patient_id
      and p.facility_id = public.current_user_facility_id()
  );
$$;

create or replace function public.can_access_storage_folder(folder_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin()
    or folder_name = public.current_user_facility_id()
    or (folder_name = 'shared' and auth.role() = 'authenticated');
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, email, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'user_' || left(new.id::text, 8)
    ),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.facilities enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.anc_visits enable row level security;
alter table public.assessments enable row level security;
alter table public.referrals enable row level security;
alter table public.follow_ups enable row level security;
alter table public.vr_modules enable row level security;
alter table public.vr_sessions enable row level security;
alter table public.team_members enable row level security;
alter table public.audit_logs enable row level security;
alter table public.media_assets enable row level security;
alter table public.branding_settings enable row level security;

create policy "facility members read facility" on public.facilities
  for select to authenticated
  using (public.current_user_is_admin() or id = public.current_user_facility_id());
create policy "admins manage facilities" on public.facilities
  for all to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "users read own profile or admin profiles" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.current_user_is_admin()
    or facility_id = public.current_user_facility_id()
  );
create policy "users update own avatar" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (avatar_uri) on public.profiles to authenticated;

create policy "facility members read patients" on public.patients
  for select to authenticated
  using (public.current_user_is_admin() or facility_id = public.current_user_facility_id());
create policy "facility members create patients" on public.patients
  for insert to authenticated
  with check (
    public.current_user_is_admin()
    or (facility_id = public.current_user_facility_id() and created_by = (select auth.uid()))
  );
create policy "facility members update patients" on public.patients
  for update to authenticated
  using (public.current_user_is_admin() or facility_id = public.current_user_facility_id())
  with check (public.current_user_is_admin() or facility_id = public.current_user_facility_id());

create policy "users read patient visits" on public.anc_visits
  for select to authenticated using (public.can_access_patient(patient_id));
create policy "users create patient visits" on public.anc_visits
  for insert to authenticated
  with check (public.can_access_patient(patient_id) and created_by = (select auth.uid()));
create policy "users update patient visits" on public.anc_visits
  for update to authenticated using (public.can_access_patient(patient_id))
  with check (public.can_access_patient(patient_id));

create policy "users read patient assessments" on public.assessments
  for select to authenticated using (public.can_access_patient(patient_id));
create policy "users create patient assessments" on public.assessments
  for insert to authenticated
  with check (public.can_access_patient(patient_id) and generated_by = (select auth.uid()));
create policy "admins update patient assessments" on public.assessments
  for update to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "users read patient referrals" on public.referrals
  for select to authenticated using (public.can_access_patient(patient_id));
create policy "users create patient referrals" on public.referrals
  for insert to authenticated
  with check (public.can_access_patient(patient_id) and created_by = (select auth.uid()));
create policy "users update patient referrals" on public.referrals
  for update to authenticated using (public.can_access_patient(patient_id))
  with check (public.can_access_patient(patient_id));

create policy "users read patient follow ups" on public.follow_ups
  for select to authenticated using (public.can_access_patient(patient_id));
create policy "users create patient follow ups" on public.follow_ups
  for insert to authenticated with check (public.can_access_patient(patient_id));
create policy "users update patient follow ups" on public.follow_ups
  for update to authenticated using (public.can_access_patient(patient_id))
  with check (public.can_access_patient(patient_id));

create policy "authenticated users read vr modules" on public.vr_modules
  for select to authenticated using (true);
create policy "admins manage vr modules" on public.vr_modules
  for all to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "users read patient vr sessions" on public.vr_sessions
  for select to authenticated
  using (patient_id is null or public.can_access_patient(patient_id));
create policy "users create patient vr sessions" on public.vr_sessions
  for insert to authenticated
  with check (patient_id is null or public.can_access_patient(patient_id));
create policy "users update patient vr sessions" on public.vr_sessions
  for update to authenticated
  using (patient_id is null or public.can_access_patient(patient_id))
  with check (patient_id is null or public.can_access_patient(patient_id));

create policy "authenticated users read team members" on public.team_members
  for select to authenticated using (true);
create policy "admins manage team members" on public.team_members
  for all to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "users read own facility audit logs" on public.audit_logs
  for select to authenticated
  using (public.current_user_is_admin() or facility_id = public.current_user_facility_id());
create policy "users append own audit logs" on public.audit_logs
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) or user_id is null)
    and (facility_id is null or facility_id = public.current_user_facility_id() or public.current_user_is_admin())
  );

create policy "authenticated users read media metadata" on public.media_assets
  for select to authenticated
  using (public.can_access_storage_folder(split_part(uri, '/', 1)));
create policy "authenticated users create media metadata" on public.media_assets
  for insert to authenticated
  with check (
    split_part(uri, '/', 1) = public.current_user_facility_id()
    or (split_part(uri, '/', 1) = 'shared' and public.current_user_is_admin())
  );
create policy "users update permitted media metadata" on public.media_assets
  for update to authenticated
  using (
    split_part(uri, '/', 1) = public.current_user_facility_id()
    or (split_part(uri, '/', 1) = 'shared' and public.current_user_is_admin())
  )
  with check (
    split_part(uri, '/', 1) = public.current_user_facility_id()
    or (split_part(uri, '/', 1) = 'shared' and public.current_user_is_admin())
  );

create policy "authenticated users read branding settings" on public.branding_settings
  for select to authenticated using (true);
create policy "admins manage branding settings" on public.branding_settings
  for all to authenticated using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "users read permitted media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and public.can_access_storage_folder((storage.foldername(name))[1])
  );
create policy "users upload permitted media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (
      (storage.foldername(name))[1] = public.current_user_facility_id()
      or (
        (storage.foldername(name))[1] = 'shared'
        and public.current_user_is_admin()
      )
    )
  );
create policy "users update permitted media" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and public.can_access_storage_folder((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'media'
    and public.can_access_storage_folder((storage.foldername(name))[1])
  );
create policy "admins delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.current_user_is_admin());
