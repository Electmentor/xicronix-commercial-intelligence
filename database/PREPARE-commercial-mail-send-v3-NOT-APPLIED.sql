-- PREPARATION ONLY. NOT APPLIED to DEV or PROD. Requires reviewed deployment approval.
-- Extends the existing outbox; no queue, no parallel mail ledger, no legacy data rewrite.
-- Baseline schema read-only verified 2026-10-11: idempotency_key + unique index already exist.
-- Apply in an isolated transaction after review. Deploy v3 backend, verify capabilities,
-- then deploy frontend. Review legacy SENDING rows separately; never resend them blindly.
begin;

alter table public.commercial_mail_outbox
  add column if not exists request_hash text,
  add column if not exists attachment_manifest jsonb not null default '[]'::jsonb,
  add column if not exists contract_version smallint;

-- A new key cannot bypass an unresolved identical request. Existing rows have NULL hashes.
create unique index if not exists commercial_mail_outbox_pending_hash_v3_uidx
  on public.commercial_mail_outbox (organization_id, request_hash)
  where request_hash is not null and status = 'SENDING';
create unique index if not exists commercial_mail_outbox_idempotency_uidx
  on public.commercial_mail_outbox (organization_id, idempotency_key)
  where idempotency_key is not null;

-- NOT VALID preserves old evidence (including historical SENT-without-ID bugs), while
-- enforcing the guard for future inserts/updates. Do not backfill a fabricated provider ID.
alter table public.commercial_mail_outbox
  add constraint commercial_mail_outbox_sent_evidence_v3_check
  check (status <> 'SENT' or nullif(btrim(provider_message_id), '') is not null) not valid;
alter table public.commercial_mail_outbox
  add constraint commercial_mail_outbox_contract_v3_check
  check (contract_version is null or
    (contract_version = 3 and request_hash ~ '^[0-9a-f]{64}$'
     and request_hash is not null and nullif(idempotency_key, '') is not null
     and jsonb_typeof(attachment_manifest) = 'array')) not valid;

-- The ledger is server-written. Preserve user reads and every existing RLS policy.
-- These are not broader access grants; anon/authenticated had no write policies at baseline.
revoke insert, update, delete, truncate, references, trigger
  on public.commercial_mail_outbox from anon, authenticated;
alter table public.commercial_mail_outbox enable row level security;

-- Invoker, service_role-only RPC. Provider acceptance + activity commit atomically.
-- SENDING is retained if anything fails, preventing an accidental second send.
create or replace function public.crm_mail_finish_send_v3(
  p_outbox_id uuid, p_organization_id uuid,
  p_provider_message_id text, p_sent_at timestamptz
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  mail public.commercial_mail_outbox%rowtype;
begin
  if p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9_-]{1,200}$'
     or p_sent_at is null then
    raise exception 'Invalid provider acceptance evidence';
  end if;
  select * into mail from public.commercial_mail_outbox
    where id = p_outbox_id and organization_id = p_organization_id for update;
  if not found or mail.contract_version is distinct from 3 or mail.request_hash is null then
    raise exception 'Outbox reservation unavailable';
  end if;
  if mail.status = 'SENT' then
    if mail.provider_message_id is distinct from p_provider_message_id then
      raise exception 'Provider evidence conflict';
    end if;
    return jsonb_build_object('status', 'SENT', 'provider_message_id', mail.provider_message_id);
  end if;
  if mail.status <> 'SENDING' then raise exception 'Outbox is not pending'; end if;

  update public.commercial_mail_outbox
     set status = 'SENT', provider_message_id = p_provider_message_id,
         sent_at = p_sent_at, updated_at = p_sent_at, error_text = null
   where id = mail.id and organization_id = p_organization_id;
  insert into public.activities (
    organization_id, lead_id, institution_id, contact_id, type, subject,
    notes, occurred_at, created_by, evidence_note
  ) values (
    mail.organization_id, mail.lead_id, mail.institution_id, mail.contact_id, 'EMAIL',
    'Correo aceptado por proveedor · ' || mail.subject,
    mail.body, p_sent_at, mail.created_by,
    'Aceptado por Resend. Entrega al destinatario no confirmada. ID: ' || p_provider_message_id
      || '. Referencia CRM: ' || mail.id::text
      || '. Adjuntos: ' || jsonb_array_length(mail.attachment_manifest)::text
  );
  return jsonb_build_object('status', 'SENT', 'provider_message_id', p_provider_message_id);
end;
$$;
revoke all on function public.crm_mail_finish_send_v3(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.crm_mail_finish_send_v3(uuid,uuid,text,timestamptz) to service_role;

-- Read-only deployment handshake. Fail closed if a required guard/index/RLS disappears.
create or replace function public.crm_mail_send_contract_v3()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'contract_version', case when
      exists (select 1 from pg_catalog.pg_class where oid = 'public.commercial_mail_outbox'::regclass and relrowsecurity)
      and (select count(*) from pg_catalog.pg_index i
        join pg_catalog.pg_class c on c.oid = i.indexrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in
          ('commercial_mail_outbox_pending_hash_v3_uidx', 'commercial_mail_outbox_idempotency_uidx')
          and i.indisvalid and i.indisunique) = 2
      and (select count(*) from pg_catalog.pg_constraint
        where conrelid = 'public.commercial_mail_outbox'::regclass
          and conname in ('commercial_mail_outbox_sent_evidence_v3_check', 'commercial_mail_outbox_contract_v3_check')) = 2
      and not pg_catalog.has_table_privilege('anon', 'public.commercial_mail_outbox', 'INSERT,UPDATE,DELETE,TRUNCATE')
      and not pg_catalog.has_table_privilege('authenticated', 'public.commercial_mail_outbox', 'INSERT,UPDATE,DELETE,TRUNCATE')
      then 3 else 0 end,
    'attachments', true, 'idempotency', true
  );
$$;
revoke all on function public.crm_mail_send_contract_v3() from public, anon, authenticated;
grant execute on function public.crm_mail_send_contract_v3() to service_role;
commit;

-- Safe application rollback: revert the frontend first. Keep this evidence/schema and
-- the v3 send gate in place, or disable sending. Do NOT re-enable the unsafe v2 sender.
-- The additive columns/indexes/RPCs can be retired only after every v3 SENDING row is
-- reconciled against provider evidence and v3 callers are removed. No destructive rollback
-- or privilege expansion is included here; retain outbox evidence and current read policies.
