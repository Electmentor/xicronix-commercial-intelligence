-- Xicronix Commercial Intelligence
-- Public PostgREST RPC contract for document version registration.
-- Keeps authorization inside private.crm_register_document_version while exposing
-- only the authenticated API surface required by app.js.

create or replace function public.crm_register_document_version(
  p_document_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_status text default 'DRAFT',
  p_notes text default null
) returns public.document_versions
language sql
security invoker
set search_path = ''
as $$
  select private.crm_register_document_version(
    p_document_id,
    p_storage_path,
    p_file_name,
    p_mime_type,
    p_size_bytes,
    p_status,
    p_notes
  );
$$;

revoke all on function public.crm_register_document_version(uuid,text,text,text,bigint,text,text) from public;
revoke all on function public.crm_register_document_version(uuid,text,text,text,bigint,text,text) from anon;
grant execute on function public.crm_register_document_version(uuid,text,text,text,bigint,text,text) to authenticated;
grant execute on function private.crm_register_document_version(uuid,text,text,text,bigint,text,text) to authenticated;
