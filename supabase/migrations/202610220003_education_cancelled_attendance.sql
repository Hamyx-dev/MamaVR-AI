create or replace function public.prevent_cancelled_education_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.education_sessions s
    where s.id = new.session_id and s.status = 'cancelled'
  ) then
    raise exception 'Attendance cannot be changed for a cancelled session.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger education_attendance_cancelled_guard
before insert or update on public.education_session_attendance
for each row execute function public.prevent_cancelled_education_attendance();