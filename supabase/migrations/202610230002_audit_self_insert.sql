drop policy if exists "users append own audit logs" on public.audit_logs;

create policy "users append own audit logs" on public.audit_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (
      user_id is null
      and (
        facility_id is null
        or facility_id = public.current_user_facility_id()
        or public.current_user_is_admin()
      )
    )
  );
