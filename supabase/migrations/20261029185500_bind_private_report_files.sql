drop policy "Workspace members can read private report files"
on storage.objects;

create policy "Workspace members can read registered report files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'releaseproof-private-reports'
  and exists (
    select 1
    from public.reports
    where reports.source_storage_path = name
      and private.is_workspace_member(reports.workspace_id)
  )
);

create policy "Uploaders can remove unregistered report files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'releaseproof-private-reports'
  and owner_id = (select auth.uid())::text
  and not exists (
    select 1
    from public.reports
    where reports.source_storage_path = name
  )
);
