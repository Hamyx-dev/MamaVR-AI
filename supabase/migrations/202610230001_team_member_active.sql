alter table public.team_members
  add column if not exists is_active boolean not null default true;
