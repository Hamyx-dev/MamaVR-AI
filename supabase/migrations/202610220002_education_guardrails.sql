create or replace function public.check_education_session_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'scheduled' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('education-facility:' || new.facility_id));
  perform pg_advisory_xact_lock(hashtext('education-facilitator:' || new.created_by::text));
  if nullif(btrim(new.location), '') is not null then
    perform pg_advisory_xact_lock(
      hashtext('education-location:' || new.facility_id || ':' || lower(btrim(new.location)))
    );
  end if;

  if exists (
    select 1 from public.education_sessions s
    where s.id <> new.id
      and s.status = 'scheduled'
      and s.facility_id = new.facility_id
      and s.created_by = new.created_by
      and tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => s.duration_minutes), '[)')
          && tstzrange(new.scheduled_at, new.scheduled_at + make_interval(mins => new.duration_minutes), '[)')
  ) then
    raise exception 'This facilitator already has a session scheduled during that time.'
      using errcode = '23P01';
  end if;

  if nullif(btrim(new.location), '') is not null and exists (
    select 1 from public.education_sessions s
    where s.id <> new.id
      and s.status = 'scheduled'
      and s.facility_id = new.facility_id
      and lower(btrim(s.location)) = lower(btrim(new.location))
      and tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => s.duration_minutes), '[)')
          && tstzrange(new.scheduled_at, new.scheduled_at + make_interval(mins => new.duration_minutes), '[)')
  ) then
    raise exception 'This location already has a session scheduled during that time.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

create trigger education_session_conflict_guard
before insert or update of scheduled_at, duration_minutes, location, status
on public.education_sessions
for each row execute function public.check_education_session_conflict();

create or replace function public.check_education_attendance_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_capacity integer;
  session_status text;
  patient_facility text;
  session_facility text;
  session_created_by uuid;
  session_start timestamptz;
  session_duration integer;
begin
  select s.max_capacity, s.status, s.facility_id, s.created_by, s.scheduled_at, s.duration_minutes
    into session_capacity, session_status, session_facility, session_created_by, session_start, session_duration
  from public.education_sessions s
  where s.id = new.session_id
  for update;

  if not found then
    raise exception 'Education session does not exist.' using errcode = '23503';
  end if;
  if session_status = 'cancelled' then
    raise exception 'Attendance cannot be added to a cancelled session.' using errcode = '23514';
  end if;

  select p.facility_id into patient_facility
  from public.patients p
  where p.id = new.patient_id
  for update;
  if not found or patient_facility is distinct from session_facility then
    raise exception 'Participant must belong to the session facility.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('education-patient:' || new.patient_id));
  if exists (
    select 1
    from public.education_session_attendance a
    join public.education_sessions s on s.id = a.session_id
    where a.patient_id = new.patient_id
      and s.id <> new.session_id
      and s.status = 'scheduled'
      and tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => s.duration_minutes), '[)')
          && tstzrange(session_start, session_start + make_interval(mins => session_duration), '[)')
  ) then
    raise exception 'This participant already has a session scheduled during that time.'
      using errcode = '23P01';
  end if;

  if not exists (
    select 1 from public.education_session_attendance a
    where a.session_id = new.session_id
      and a.patient_id = new.patient_id
      and (tg_op = 'INSERT' or a.id <> new.id)
  ) and (
    select count(*) from public.education_session_attendance a
    where a.session_id = new.session_id
      and (tg_op = 'INSERT' or a.id <> new.id)
  ) >= session_capacity then
    raise exception 'Education session capacity has been reached.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger education_attendance_capacity_guard
before insert or update of session_id, patient_id
on public.education_session_attendance
for each row execute function public.check_education_attendance_capacity();