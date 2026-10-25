revoke execute on function public.handle_new_user(), public.enforce_submission_rules(),
  public.log_submission_activity(), public.settings_touch() from anon, authenticated, public;
revoke execute on function public.has_role(uuid, app_role), public.my_team_id() from anon, public;
grant execute on function public.has_role(uuid, app_role), public.my_team_id() to authenticated;