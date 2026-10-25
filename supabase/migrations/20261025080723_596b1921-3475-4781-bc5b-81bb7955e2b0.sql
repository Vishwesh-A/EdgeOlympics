
-- ROLES
create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- TEAMS
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.teams to authenticated;
grant all on public.teams to service_role;
alter table public.teams enable row level security;

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
grant select on public.team_members to authenticated;
grant all on public.team_members to service_role;
alter table public.team_members enable row level security;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid() limit 1
$$;

create policy "members read own team" on public.teams for select to authenticated
  using (id = public.my_team_id() or public.has_role(auth.uid(),'admin'));
create policy "members read teammates" on public.team_members for select to authenticated
  using (team_id = public.my_team_id() or public.has_role(auth.uid(),'admin'));
create policy "read own or teammate profiles" on public.profiles for select to authenticated
  using (id = auth.uid()
    or id in (select user_id from public.team_members where team_id = public.my_team_id())
    or public.has_role(auth.uid(),'admin'));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.create_team(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.my_team_id() is not null then raise exception 'You are already in a team'; end if;
  if length(trim(coalesce(_name,''))) < 2 or length(trim(_name)) > 40 then
    raise exception 'Team name must be 2-40 characters'; end if;
  insert into public.teams (name, created_by) values (trim(_name), auth.uid()) returning id into _id;
  insert into public.team_members (team_id, user_id) values (_id, auth.uid());
  return _id;
exception when unique_violation then
  raise exception 'That team name is taken';
end $$;

create or replace function public.join_team(_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.my_team_id() is not null then raise exception 'You are already in a team'; end if;
  select id into _id from public.teams where join_code = upper(trim(_code));
  if _id is null then raise exception 'No team found with that code'; end if;
  insert into public.team_members (team_id, user_id) values (_id, auth.uid());
  return _id;
end $$;

-- SETTINGS (single row)
create table public.settings (
  id int primary key default 1 check (id = 1),
  submission_deadline timestamptz,
  weight_accuracy numeric not null default 0.6,
  weight_latency numeric not null default 0.25,
  weight_ram numeric not null default 0.15,
  leaderboard_visible boolean not null default true,
  leaderboard_frozen boolean not null default false,
  frozen_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "anyone reads settings" on public.settings for select to anon, authenticated using (true);
create policy "admins update settings" on public.settings for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.settings_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  if new.leaderboard_frozen and not old.leaderboard_frozen then new.frozen_at = now(); end if;
  if not new.leaderboard_frozen then new.frozen_at = null; end if;
  return new;
end $$;
create trigger settings_touch before update on public.settings for each row execute function public.settings_touch();

-- SUBMISSIONS
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  submitted_by uuid default auth.uid(),
  file_path text,
  original_filename text,
  file_deleted boolean not null default false,
  status text not null default 'pending_prelim' check (status in (
    'pending_prelim','queued_for_edge','running','completed',
    'failed_prelim','failed_runtime','failed_timeout','failed_oom','disqualified')),
  error_log text,
  pi_id text,
  claimed_at timestamptz,
  last_heartbeat timestamptz,
  accuracy numeric,
  latency_ms numeric,
  peak_ram_mb numeric,
  model_size_mb numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index submissions_team_idx on public.submissions(team_id);
create index submissions_status_idx on public.submissions(status);
grant select, insert on public.submissions to authenticated;
grant all on public.submissions to service_role;
alter table public.submissions enable row level security;

create policy "team reads own submissions" on public.submissions for select to authenticated
  using (team_id = public.my_team_id() or public.has_role(auth.uid(),'admin'));
create policy "team inserts own submissions" on public.submissions for insert to authenticated
  with check (team_id = public.my_team_id());
-- no update/delete policies for participants: status & metrics are backend-only

-- Race-safe limit + deadline + force safe defaults
create or replace function public.enforce_submission_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare _used int; _deadline timestamptz;
begin
  if coalesce(auth.role(),'') = 'service_role' then return new; end if;

  perform 1 from public.teams where id = new.team_id for update; -- serialize per team

  select submission_deadline into _deadline from public.settings where id = 1;
  if _deadline is not null and now() > _deadline then
    raise exception 'The submission deadline has passed';
  end if;

  select count(*) into _used from public.submissions
   where team_id = new.team_id
     and status in ('pending_prelim','queued_for_edge','running','completed','disqualified');
  if _used >= 3 then
    raise exception 'No submission slots left (3 of 3 used)';
  end if;

  if new.file_path is null or split_part(new.file_path,'/',1) <> new.team_id::text
     or not (lower(new.file_path) like '%.tflite' or lower(new.file_path) like '%.onnx') then
    raise exception 'Invalid file path';
  end if;

  new.status := 'pending_prelim';
  new.submitted_by := auth.uid();
  new.error_log := null; new.pi_id := null; new.claimed_at := null; new.last_heartbeat := null;
  new.accuracy := null; new.latency_ms := null; new.peak_ram_mb := null;
  new.completed_at := null; new.file_deleted := false; new.created_at := now();
  return new;
end $$;
create trigger enforce_submission_rules before insert on public.submissions
  for each row execute function public.enforce_submission_rules();

create or replace function public.team_slots()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'used', (select count(*) from public.submissions where team_id = public.my_team_id()
             and status in ('pending_prelim','queued_for_edge','running','completed','disqualified')),
    'limit', 3,
    'deadline', (select submission_deadline from public.settings where id = 1))
$$;

-- ACTIVITY (public ticker, also realtime signal for anon)
create table public.activity_events (
  id bigint generated always as identity primary key,
  team_name text not null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
grant select on public.activity_events to anon, authenticated;
grant all on public.activity_events to service_role;
alter table public.activity_events enable row level security;
create policy "anyone reads activity" on public.activity_events for select to anon, authenticated using (true);

create or replace function public.log_submission_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare _team text; _msg text;
begin
  select name into _team from public.teams where id = new.team_id;
  if tg_op = 'INSERT' then
    _msg := 'uploaded a new model';
  elsif new.status is distinct from old.status then
    _msg := case new.status
      when 'queued_for_edge' then 'passed prelim checks'
      when 'running' then 'started a run' || coalesce(' on ' || new.pi_id, '')
      when 'completed' then 'just completed a run'
      when 'disqualified' then 'was disqualified on a submission'
      when 'pending_prelim' then null
      else 'had a run fail' end;
  elsif new.accuracy is distinct from old.accuracy and new.status = 'completed' then
    _msg := 'updated results';
  end if;
  if _msg is not null then
    insert into public.activity_events (team_name, kind, message)
    values (coalesce(_team,'A team'), new.status, _msg);
  end if;
  return new;
end $$;
create trigger log_submission_activity after insert or update on public.submissions
  for each row execute function public.log_submission_activity();

-- PUBLIC LEADERBOARD (team name + metrics only)
create or replace function public.get_leaderboard()
returns table (team_id uuid, team_name text, accuracy numeric, latency_ms numeric,
               peak_ram_mb numeric, model_size_mb numeric, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.settings where id = 1),
  best as (
    select distinct on (sub.team_id) sub.team_id, t.name as team_name, sub.accuracy, sub.latency_ms,
           sub.peak_ram_mb, sub.model_size_mb, sub.completed_at
    from public.submissions sub join public.teams t on t.id = sub.team_id, s
    where sub.status = 'completed' and sub.accuracy is not null
      and (not s.leaderboard_frozen or sub.completed_at <= s.frozen_at)
    order by sub.team_id, sub.accuracy desc, sub.latency_ms asc nulls last, sub.peak_ram_mb asc nulls last
  )
  select b.* from best b, s
  where s.leaderboard_visible or public.has_role(auth.uid(),'admin')
  order by b.accuracy desc, b.latency_ms asc nulls last, b.peak_ram_mb asc nulls last
$$;
grant execute on function public.get_leaderboard() to anon, authenticated;

-- ORGANIZER ACTIONS
create or replace function public.admin_submission_action(_id uuid, _action text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Organizers only'; end if;
  if _action = 'requeue' then
    update public.submissions set status='queued_for_edge', pi_id=null, claimed_at=null,
      last_heartbeat=null, error_log=null, completed_at=null where id=_id;
  elsif _action = 'disqualify' then
    update public.submissions set status='disqualified',
      error_log=coalesce(_note,'Disqualified by organizer') where id=_id;
  elsif _action = 'mark_failed' then
    update public.submissions set status='failed_runtime',
      error_log=coalesce(_note,'Marked failed by organizer') where id=_id;
  elsif _action = 'file_deleted' then
    update public.submissions set file_deleted=true where id=_id;
  else raise exception 'Unknown action'; end if;
end $$;

revoke execute on function public.create_team(text), public.join_team(text), public.team_slots(),
  public.admin_submission_action(uuid,text,text) from anon, public;
grant execute on function public.create_team(text), public.join_team(text), public.team_slots(),
  public.admin_submission_action(uuid,text,text), public.my_team_id(), public.has_role(uuid,app_role) to authenticated;

-- STORAGE POLICIES (bucket "models")
create policy "team uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'models'
    and (storage.foldername(name))[1] = public.my_team_id()::text
    and lower(storage.extension(name)) in ('tflite','onnx'));
create policy "team reads own folder" on storage.objects for select to authenticated
  using (bucket_id = 'models' and ((storage.foldername(name))[1] = public.my_team_id()::text
    or public.has_role(auth.uid(),'admin')));
create policy "team removes own orphan upload or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'models' and (public.has_role(auth.uid(),'admin')
    or ((storage.foldername(name))[1] = public.my_team_id()::text
        and not exists (select 1 from public.submissions s where s.file_path = name))));

-- REALTIME
alter table public.submissions replica identity full;
alter publication supabase_realtime add table public.submissions, public.activity_events, public.settings;
