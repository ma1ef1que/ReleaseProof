insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'releaseproof-private-reports',
  'releaseproof-private-reports',
  false,
  26214400,
  array['application/json', 'application/zip']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function private.report_workspace_from_storage_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(json|zip)$'
    then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function private.report_workspace_from_storage_path(text) from public, anon, authenticated;
grant execute on function private.report_workspace_from_storage_path(text) to authenticated;

create policy "Workspace members can read private report files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'releaseproof-private-reports'
  and private.is_workspace_member(
    private.report_workspace_from_storage_path(name)
  )
);

create policy "Editors can upload workspace report files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'releaseproof-private-reports'
  and private.has_workspace_role(
    private.report_workspace_from_storage_path(name),
    array['owner', 'admin', 'editor']
  )
  and owner_id = (select auth.uid())::text
);

create policy "Workspace owners and admins can delete report files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'releaseproof-private-reports'
  and private.has_workspace_role(
    private.report_workspace_from_storage_path(name),
    array['owner', 'admin']
  )
);

create table public.reports (
  id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  environment text,
  build_version text,
  commit_sha text,
  run_date text,
  notes text,
  user_reported_blocker boolean not null default false,
  source_format text not null,
  source_filename text not null,
  source_content_type text not null,
  source_storage_path text not null unique,
  source_size_bytes bigint not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  primary key (id),
  unique (workspace_id, id),
  constraint reports_title_length check (
    char_length(title) between 1 and 200
    and char_length(btrim(title)) > 0
  ),
  constraint reports_environment_length check (
    environment is null or char_length(environment) <= 120
  ),
  constraint reports_build_version_length check (
    build_version is null or char_length(build_version) <= 120
  ),
  constraint reports_commit_sha_length check (
    commit_sha is null or char_length(commit_sha) <= 80
  ),
  constraint reports_run_date_length check (
    run_date is null or char_length(run_date) <= 80
  ),
  constraint reports_notes_length check (
    notes is null or char_length(notes) <= 2000
  ),
  constraint reports_source_format check (source_format in ('json', 'zip')),
  constraint reports_source_filename_length check (
    char_length(source_filename) between 1 and 255
  ),
  constraint reports_source_content_type check (
    (source_format = 'json' and source_content_type = 'application/json')
    or (source_format = 'zip' and source_content_type = 'application/zip')
  ),
  constraint reports_source_size_limit check (
    source_size_bytes > 0
    and (
      (source_format = 'json' and source_size_bytes <= 10485760)
      or (source_format = 'zip' and source_size_bytes <= 26214400)
    )
  ),
  constraint reports_storage_path_matches_workspace check (
    source_storage_path =
      workspace_id::text || '/' || id::text || '/source.' || source_format
  ),
  constraint reports_version_positive check (version > 0)
);

create index reports_workspace_updated_idx
  on public.reports (workspace_id, updated_at desc);

create table public.qa_checklist_items (
  workspace_id uuid not null,
  report_id uuid not null,
  item_key text not null,
  label text not null,
  status text not null,
  note text,
  required boolean not null default true,
  sort_order integer not null,
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (report_id, item_key),
  foreign key (workspace_id, report_id)
    references public.reports (workspace_id, id)
    on delete cascade,
  constraint qa_checklist_item_key_length check (
    char_length(item_key) between 1 and 80
  ),
  constraint qa_checklist_label_length check (
    char_length(label) between 1 and 160
    and char_length(btrim(label)) > 0
  ),
  constraint qa_checklist_status check (
    status in ('not_checked', 'pass', 'fail', 'not_applicable')
  ),
  constraint qa_checklist_note_length check (
    note is null or char_length(note) <= 500
  ),
  constraint qa_checklist_sort_order check (sort_order >= 0)
);

create index qa_checklist_items_workspace_report_idx
  on public.qa_checklist_items (workspace_id, report_id, sort_order);

create trigger reports_touch_updated_at
before update on public.reports
for each row
execute function public.touch_updated_at();

alter table public.reports enable row level security;
alter table public.reports force row level security;
alter table public.qa_checklist_items enable row level security;
alter table public.qa_checklist_items force row level security;

revoke all on table public.reports from public, anon, authenticated;
revoke all on table public.qa_checklist_items from public, anon, authenticated;
grant select on table public.reports to authenticated;
grant select on table public.qa_checklist_items to authenticated;

create policy "Workspace members can read report metadata"
on public.reports
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace members can read report checklists"
on public.qa_checklist_items
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create function private.validate_report_metadata(p_metadata jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_title text;
begin
  if jsonb_typeof(p_metadata) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Report metadata is invalid';
  end if;

  v_title := btrim(p_metadata ->> 'runTitle');
  if v_title is null or char_length(v_title) not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'Report title must contain between 1 and 200 characters';
  end if;

  if char_length(coalesce(p_metadata ->> 'environment', '')) > 120
     or char_length(coalesce(p_metadata ->> 'buildVersion', '')) > 120
     or char_length(coalesce(p_metadata ->> 'commitSha', '')) > 80
     or char_length(coalesce(p_metadata ->> 'runDate', '')) > 80
     or char_length(coalesce(p_metadata ->> 'notes', '')) > 2000
  then
    raise exception using
      errcode = '22023',
      message = 'Report metadata exceeds the configured field limits';
  end if;

  if p_metadata ? 'userReportedBlocker'
     and jsonb_typeof(p_metadata -> 'userReportedBlocker') <> 'boolean'
  then
    raise exception using
      errcode = '22023',
      message = 'The report blocker flag is invalid';
  end if;
end;
$$;

revoke all on function private.validate_report_metadata(jsonb) from public, anon, authenticated;

create function private.validate_checklist(p_checklist jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_checklist) <> 'array'
     or jsonb_array_length(p_checklist) > 100
  then
    raise exception using
      errcode = '22023',
      message = 'The checklist must contain at most 100 items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_checklist) as item
    where jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item -> 'id') <> 'string'
       or char_length(item ->> 'id') not between 1 and 80
       or jsonb_typeof(item -> 'label') <> 'string'
       or char_length(btrim(item ->> 'label')) not between 1 and 160
       or jsonb_typeof(item -> 'status') <> 'string'
       or item ->> 'status' not in (
         'not_checked',
         'pass',
         'fail',
         'not_applicable'
       )
       or jsonb_typeof(item -> 'required') <> 'boolean'
       or (
         item ? 'note'
         and jsonb_typeof(item -> 'note') not in ('string', 'null')
       )
       or char_length(coalesce(item ->> 'note', '')) > 500
  ) then
    raise exception using
      errcode = '22023',
      message = 'One or more checklist items are invalid';
  end if;

  if (
    select count(*) <> count(distinct item ->> 'id')
    from jsonb_array_elements(p_checklist) as item
  ) then
    raise exception using
      errcode = '22023',
      message = 'Checklist item identifiers must be unique';
  end if;
end;
$$;

revoke all on function private.validate_checklist(jsonb) from public, anon, authenticated;

create function public.create_report(
  p_workspace_id uuid,
  p_report_id uuid,
  p_source_format text,
  p_source_filename text,
  p_source_size_bytes bigint,
  p_source_content_type text,
  p_metadata jsonb,
  p_checklist jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_source_path text;
  v_actual_size bigint;
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to create a report';
  end if;

  select wm.role
  into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('owner', 'admin', 'editor') then
    raise exception using
      errcode = '42501',
      message = 'Workspace editor access is required to create a report';
  end if;

  if p_source_format is null or p_source_format not in ('json', 'zip') then
    raise exception using
      errcode = '22023',
      message = 'Only Playwright JSON and ZIP reports are supported';
  end if;

  if p_source_filename is null
     or char_length(p_source_filename) not between 1 and 255
     or p_source_filename ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'The report filename is invalid';
  end if;

  if p_source_content_type <> (
     case p_source_format
       when 'json' then 'application/json'
       else 'application/zip'
     end
  )
  then
    raise exception using
      errcode = '22023',
      message = 'The report content type does not match its format';
  end if;

  v_source_path :=
    p_workspace_id::text || '/' || p_report_id::text || '/source.' || p_source_format;

  if private.report_workspace_from_storage_path(v_source_path) <> p_workspace_id then
    raise exception using
      errcode = '22023',
      message = 'The report storage path is invalid';
  end if;

  select (objects.metadata ->> 'size')::bigint
  into v_actual_size
  from storage.objects as objects
  where objects.bucket_id = 'releaseproof-private-reports'
    and objects.name = v_source_path
    and objects.owner_id = v_actor_id::text;

  if not found or v_actual_size is null or v_actual_size <> p_source_size_bytes then
    raise exception using
      errcode = '22023',
      message = 'The uploaded report file could not be verified';
  end if;

  if p_source_size_bytes <= 0
     or (
       p_source_format = 'json'
       and p_source_size_bytes > 10485760
     )
     or (
       p_source_format = 'zip'
       and p_source_size_bytes > 26214400
     )
  then
    raise exception using
      errcode = '22023',
      message = 'The report exceeds the upload size limit';
  end if;

  perform private.validate_report_metadata(p_metadata);
  perform private.validate_checklist(p_checklist);

  insert into public.reports (
    id,
    workspace_id,
    title,
    environment,
    build_version,
    commit_sha,
    run_date,
    notes,
    user_reported_blocker,
    source_format,
    source_filename,
    source_content_type,
    source_storage_path,
    source_size_bytes,
    created_by
  )
  values (
    p_report_id,
    p_workspace_id,
    btrim(p_metadata ->> 'runTitle'),
    nullif(btrim(p_metadata ->> 'environment'), ''),
    nullif(btrim(p_metadata ->> 'buildVersion'), ''),
    nullif(btrim(p_metadata ->> 'commitSha'), ''),
    nullif(btrim(p_metadata ->> 'runDate'), ''),
    nullif(btrim(p_metadata ->> 'notes'), ''),
    coalesce((p_metadata ->> 'userReportedBlocker')::boolean, false),
    p_source_format,
    p_source_filename,
    p_source_content_type,
    v_source_path,
    p_source_size_bytes,
    v_actor_id
  );

  insert into public.qa_checklist_items (
    workspace_id,
    report_id,
    item_key,
    label,
    status,
    note,
    required,
    sort_order,
    updated_by
  )
  select
    p_workspace_id,
    p_report_id,
    item ->> 'id',
    btrim(item ->> 'label'),
    item ->> 'status',
    nullif(item ->> 'note', ''),
    (item ->> 'required')::boolean,
    ordinality::integer - 1,
    v_actor_id
  from jsonb_array_elements(p_checklist) with ordinality as items(item, ordinality);

  return p_report_id;
end;
$$;

revoke all on function public.create_report(uuid,uuid,text,text,bigint,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_report(uuid,uuid,text,text,bigint,text,jsonb,jsonb) to authenticated;

create function public.save_report_state(
  p_report_id uuid,
  p_expected_version integer,
  p_metadata jsonb,
  p_checklist jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to update a report';
  end if;

  select reports.*
  into v_report
  from public.reports as reports
  where reports.id = p_report_id
  for update;

  if not found
     or not private.has_workspace_role(
       v_report.workspace_id,
       array['owner', 'admin', 'editor']
     )
  then
    raise exception using
      errcode = '42501',
      message = 'Workspace editor access is required to update this report';
  end if;

  if p_expected_version is distinct from v_report.version then
    raise exception using
      errcode = '40001',
      message = 'This report changed in another session. Reload before saving.';
  end if;

  perform private.validate_report_metadata(p_metadata);
  perform private.validate_checklist(p_checklist);

  update public.reports
  set title = btrim(p_metadata ->> 'runTitle'),
      environment = nullif(btrim(p_metadata ->> 'environment'), ''),
      build_version = nullif(btrim(p_metadata ->> 'buildVersion'), ''),
      commit_sha = nullif(btrim(p_metadata ->> 'commitSha'), ''),
      run_date = nullif(btrim(p_metadata ->> 'runDate'), ''),
      notes = nullif(btrim(p_metadata ->> 'notes'), ''),
      user_reported_blocker =
        coalesce((p_metadata ->> 'userReportedBlocker')::boolean, false),
      version = version + 1
  where id = p_report_id
  returning version into v_report.version;

  delete from public.qa_checklist_items
  where report_id = p_report_id;

  insert into public.qa_checklist_items (
    workspace_id,
    report_id,
    item_key,
    label,
    status,
    note,
    required,
    sort_order,
    updated_by
  )
  select
    v_report.workspace_id,
    p_report_id,
    item ->> 'id',
    btrim(item ->> 'label'),
    item ->> 'status',
    nullif(item ->> 'note', ''),
    (item ->> 'required')::boolean,
    ordinality::integer - 1,
    v_actor_id
  from jsonb_array_elements(p_checklist) with ordinality as items(item, ordinality);

  return v_report.version;
end;
$$;

revoke all on function public.save_report_state(uuid,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_report_state(uuid,integer,jsonb,jsonb) to authenticated;

create function public.delete_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select reports.workspace_id
  into v_workspace_id
  from public.reports as reports
  where reports.id = p_report_id
  for update;

  if not found or not private.has_workspace_role(
    v_workspace_id,
    array['owner', 'admin']
  ) then
    raise exception using
      errcode = '42501',
      message = 'Workspace owner or admin access is required to delete a report';
  end if;

  delete from public.reports
  where id = p_report_id;
end;
$$;

revoke all on function public.delete_report(uuid) from public, anon, authenticated;
grant execute on function public.delete_report(uuid) to authenticated;
