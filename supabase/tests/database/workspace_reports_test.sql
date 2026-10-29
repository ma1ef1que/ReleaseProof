create extension if not exists pgtap with schema extensions;

begin;

select plan(29);

select is(
  (select public from storage.buckets where id = 'releaseproof-private-reports'),
  false,
  'shared report storage is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'releaseproof-private-reports'),
  26214400::bigint,
  'private report storage enforces its 25 MiB limit'
);
select ok(
  not has_table_privilege('anon', 'public.reports', 'SELECT'),
  'anonymous users cannot read report metadata'
);
select ok(
  not has_table_privilege('authenticated', 'public.reports', 'INSERT'),
  'members cannot register reports outside the guarded RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.reports', 'UPDATE'),
  'members cannot update reports outside the guarded RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.reports', 'DELETE'),
  'members cannot delete reports outside the guarded RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_report(uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot register reports'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_report(uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can call the role-checked report creation RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_report_state(uuid,integer,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can call the role-checked state save RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_report(uuid)',
    'EXECUTE'
  ),
  'authenticated users can call the role-checked deletion RPC'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Uploaders can remove unregistered report files'
  ),
  'Storage API cleanup is limited to each uploader''s unregistered file'
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reports'
  ),
  'report changes are available to workspace-authorized Realtime subscribers'
);

insert into auth.users (id, email)
values
  ('51000000-0000-0000-0000-000000000001', 'owner@reports.test'),
  ('51000000-0000-0000-0000-000000000002', 'editor@reports.test'),
  ('51000000-0000-0000-0000-000000000003', 'viewer@reports.test'),
  ('51000000-0000-0000-0000-000000000004', 'outsider@reports.test');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.reports_workspace_id',
  public.create_workspace('Report test workspace', null)::text,
  true
);

reset role;
insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    current_setting('test.reports_workspace_id')::uuid,
    '51000000-0000-0000-0000-000000000002',
    'editor'
  ),
  (
    current_setting('test.reports_workspace_id')::uuid,
    '51000000-0000-0000-0000-000000000003',
    'viewer'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.outsider_workspace_id',
  public.create_workspace('Other report workspace', null)::text,
  true
);

reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'releaseproof-private-reports',
  current_setting('test.reports_workspace_id') ||
    '/51000000-0000-0000-0000-000000000101/source.json',
  '51000000-0000-0000-0000-000000000002',
  '{"size":"4","mimetype":"application/json"}'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.create_report(
    current_setting('test.reports_workspace_id')::uuid,
    '51000000-0000-0000-0000-000000000101',
    'json',
    'report.json',
    4,
    'application/json',
    '{"runTitle":"Shared report"}'::jsonb,
    '[{"id":"critical-check","label":"Critical flow reviewed","status":"not_checked","required":true}]'::jsonb
  )$$,
  'an editor can register an owned, verified private report'
);
select is(
  (select count(*)::integer from public.reports),
  1,
  'the registered report is visible to an editor'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = current_setting('test.reports_workspace_id') ||
      '/51000000-0000-0000-0000-000000000101/source.json'
  ),
  1,
  'a workspace editor can read a registered report file'
);

reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'releaseproof-private-reports',
  current_setting('test.reports_workspace_id') ||
    '/51000000-0000-0000-0000-000000000102/source.json',
  '51000000-0000-0000-0000-000000000002',
  '{"size":"4","mimetype":"application/json"}'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = current_setting('test.reports_workspace_id') ||
      '/51000000-0000-0000-0000-000000000102/source.json'
  ),
  0,
  'an unregistered upload is not readable, even by a workspace member'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = current_setting('test.reports_workspace_id') ||
      '/51000000-0000-0000-0000-000000000101/source.json'
  ),
  1,
  'a workspace viewer can read a registered report file'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'releaseproof-private-reports',
      current_setting('test.reports_workspace_id') ||
        '/51000000-0000-0000-0000-000000000103/source.json',
      '51000000-0000-0000-0000-000000000003',
      '{"size":"4","mimetype":"application/json"}'
    )$$,
  '42501',
  null,
  'a viewer cannot upload a report file'
);
select throws_ok(
  $$select public.save_report_state(
    '51000000-0000-0000-0000-000000000101',
    1,
    '{"runTitle":"Viewer change"}'::jsonb,
    '[]'::jsonb
  )$$,
  '42501',
  'Workspace editor access is required to update this report',
  'a viewer cannot save report metadata or checklist state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = current_setting('test.reports_workspace_id') ||
      '/51000000-0000-0000-0000-000000000101/source.json'
  ),
  0,
  'members of another workspace cannot read the private report file'
);
select is(
  (select count(*)::integer from public.reports),
  0,
  'members of another workspace cannot read report metadata'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'releaseproof-private-reports',
      current_setting('test.reports_workspace_id') ||
        '/51000000-0000-0000-0000-000000000104/source.json',
      '51000000-0000-0000-0000-000000000004',
      '{"size":"4","mimetype":"application/json"}'
    )$$,
  '42501',
  null,
  'a member cannot upload to another workspace'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.save_report_state(
    '51000000-0000-0000-0000-000000000101',
    1,
    '{"runTitle":"Updated shared report"}'::jsonb,
    '[{"id":"critical-check","label":"Critical flow reviewed","status":"pass","required":true}]'::jsonb
  ),
  2,
  'an editor can save checklist state and increment the report version'
);
select throws_ok(
  $$select public.save_report_state(
    '51000000-0000-0000-0000-000000000101',
    1,
    '{"runTitle":"Stale report"}'::jsonb,
    '[]'::jsonb
  )$$,
  '40001',
  'This report changed in another session. Reload before saving.',
  'stale report versions are rejected'
);
select throws_ok(
  $$select public.delete_report('51000000-0000-0000-0000-000000000101')$$,
  '42501',
  'Workspace owner or admin access is required to delete a report',
  'an editor cannot delete a shared report'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.delete_report('51000000-0000-0000-0000-000000000101')$$,
  'a workspace owner can delete a report'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = current_setting('test.reports_workspace_id') ||
      '/51000000-0000-0000-0000-000000000101/source.json'
  ),
  0,
  'deleting report metadata immediately revokes workspace file reads'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
reset role;
select is(
  (
    select count(*)::integer
    from public.reports
    where id = '51000000-0000-0000-0000-000000000101'
  ),
  0,
  'the report metadata is deleted'
);
select is(
  (
    select count(*)::integer
    from public.qa_checklist_items
    where report_id = '51000000-0000-0000-0000-000000000101'
  ),
  0,
  'the report checklist rows are deleted'
);

select * from finish();
rollback;
