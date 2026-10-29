-- Match the participant contract and the Raspberry Pi benchmark runtime.
drop policy if exists "team uploads to own folder" on storage.objects;
create policy "team uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'models'
    and (storage.foldername(name))[1] = public.my_team_id()::text
    and lower(storage.extension(name)) = 'tflite');

create or replace function public.reject_unsupported_model()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.file_path is null or lower(new.file_path) not like '%.tflite' then
    raise exception 'Only .tflite model submissions are accepted';
  end if;
  return new;
end $$;

create trigger reject_unsupported_model before insert on public.submissions
  for each row execute function public.reject_unsupported_model();

revoke execute on function public.reject_unsupported_model() from anon, authenticated, public;
