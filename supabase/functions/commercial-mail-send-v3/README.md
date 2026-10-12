# commercial-mail-send v3: prepared, not deployed

This candidate fixes the v2 false-SENT path and sends explicitly selected existing
case documents as actual private attachments. No live email, document, lead or database
row was changed while preparing it. Schema/RLS/bucket metadata was read only.

## HTTP contract

Authenticated POST (normal Supabase user bearer token):

- Read-only handshake: `{"action":"capabilities"}` →
  `{"ok":true,"contract_version":3,"attachments":true,"idempotency":true,"limits":{...}}`.
  The response is available only to ADMIN/MANAGER/SALES with a current profile, after
  checking the database v3 guard and that `crm-documents` is private.
- Send: `{lead_id,to,subject,body,document_ids:[uuid,...],idempotency_key:uuid}`.
  `document_ids` defaults to an empty array. No URL, bucket, arbitrary path, HTML,
  sender, CC or BCC can be supplied by the caller.
- Confirmed provider acceptance and committed audit (HTTP 200):
  `{ok:true,status:"SENT",delivery_status:"UNCONFIRMED",provider_message_id,outbox_id,replayed,document_ids}`.
  SENT means provider acceptance, never recipient delivery. Only a separate verified
  delivery event could establish delivery; this change adds no delivery webhook.
- Ambiguous provider result/reservation/finalization (HTTP 202 or 409):
  `{ok:false,status:"UNKNOWN",error,requires_review:true,retry_allowed:false,outbox_id?}`.
  If the provider already accepted but the audit could not be confirmed, the response
  also includes `provider_status:"ACCEPTED"`, provider ID and unconfirmed delivery.
- Definite provider rejection (HTTP 502) or replay of a rejected attempt (409):
  `{ok:false,status:"FAILED",error,requires_review:false,retry_allowed:true,outbox_id}`.
  A new attempt must be an explicit user decision. The old key never sends again.
- Validation/access/pre-reservation errors: non-2xx, `ok:false`, `error`,
  `send_attempted:false`, normally `retry_allowed:true`. Idempotency conflicts cannot
  be retried as a new attempt automatically. Errors never echo secrets or email bodies.

The frontend MUST check capabilities before send, preserve a UUID across uncertain
responses and reloads, and check all success fields. HTTP 202 is not success. A v2
backend fails the handshake before any real email payload is submitted.

## Authorization and attachment policy

Verified Auth `/user`, current `profiles` role/org and user-context RLS reads are
combined with explicit lead scoping. ADMIN can act within its organization;
MANAGER/SALES need `coalesce(owner_user_id,created_by)` to equal the authenticated user,
matching existing `workspace.mjs`. UI workspace mode cannot grant rights.

Every document and version must match the same org and lead, be CURRENT/SENT/SIGNED,
and have exactly one current version matching `documents.current_version`. Storage
must match `<org>/<lead>/<document>/v<number>/<safe_filename>` in `crm-documents`.
Downloads use the authenticated user's token, bounded streaming, and redirect refusal.
No arbitrary URL is fetched and the provider never fetches a public/signed document URL.

Limits: 10 files, 20 MiB each and 20 MiB total raw bytes; 20,000 body characters and
64 KiB request body. Provider base64 overhead stays below the documented 40 MB ceiling.
Types: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, PNG, JPEG, WebP, TXT, CSV. Filename extension,
metadata MIME, response MIME, declared/actual bytes and basic file signature are checked.
Unknown type/size, stale/missing versions and any failed download block the entire send.
Basic signatures are not antivirus or a full Office/PDF parser. The manifest saves the
exact version and SHA-256 of bytes handed to the provider. Files are not modified.

## Durable send guard

The existing `commercial_mail_outbox` and its existing `(organization_id,idempotency_key)`
unique index are reused. Preparation adds only a request fingerprint, attachment manifest,
contract version, a partial unique index for identical unresolved requests and two RPCs.

A durable SENDING row is inserted before calling Resend. The provider receives the same
stable idempotency key but this endpoint deliberately never calls it twice for one row,
even after Resend's 24-hour key window expires. Concurrent duplicate-key inserts lose
atomically. A new key also cannot bypass an identical unresolved SENDING fingerprint.
If the process stops after reserving but before sending, the conservative result needs
review instead of an automatic resend. An explicitly new UUID after a completed SENT
request represents a new send; the client must retain its original UUID for retries.

Provider acceptance and the EMAIL activity commit in one service-only, invoker RPC.
An activity error rolls back the SENT update. Provider acceptance is not relabeled FAILED
when the database fails. Review can confirm the provider ID and finalize the existing
row without sending a second message. Ambiguous rows are never expired/deleted to retry.
Historical SENT rows without a provider ID are not fabricated, backfilled or treated as
new evidence. The SQL `NOT VALID` check protects future writes while retaining history.

## Deployment prerequisites and verification remaining

1. Review `database/PREPARE-commercial-mail-send-v3-NOT-APPLIED.sql` and test it in an
   isolated PostgreSQL/Supabase environment with synthetic identities and documents.
   The file is preparation, not a recorded/applied migration. Its constraint additions
   intentionally stop on a second application; do not blindly rerun a partially managed rollout.
2. Verify actual RLS for all roles/orgs, authenticated Storage REST route and MIME behavior,
   current SDK-free REST shape, activity triggers and transaction rollback using fixtures.
   No PostgreSQL engine or live delivery was exercised during this local implementation.
3. After production-change approval: apply the reviewed additive schema, then deploy the
   versioned function `commercial-mail-send-v3`. The current `commercial-mail-send` endpoint
   stays unchanged during preparation and the cutover; both use the same existing outbox.
   Call v3's authenticated read-only handshake and verify contract_version 3 without sending.
   Only then deploy this frontend, which explicitly invokes the versioned v3 endpoint.
   Existing frontend sessions keep using their previous endpoint until reload; a v3 outage
   blocks only v3 sends and never falls back silently to the unsafe v2 sender.
   Confirm frontend adoption/reload, then retire the old send endpoint in the authorized
   release window. Old clients must reload instead of being allowed to omit v3 safeguards.
   This avoids an unnecessary pre-cutover interruption; it is a versioned migration of one
   mail flow, not a second outbox, queue, credential set or delivery system.
   A separately authorized controlled send to an approved test recipient verifies delivery
   integration. Real lead data and customer recipients are not test fixtures.
4. Environment secrets already required: SUPABASE_URL, SUPABASE_ANON_KEY (or
   SUPABASE_PUBLISHABLE_KEY), SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
   Optional CRM_MAIL_ALLOWED_ORIGINS is a comma-separated exact origin allowlist.
   Default: `https://xicronix-commercial-intelligence.vercel.app`.
   No new credentials, paid services, packages or persistent access are introduced.
5. Before frontend cutover, abandon the v3 candidate without changing the existing endpoint.
   After cutover, retain the v3 safe-send gate and durable evidence. Do not restore v2 sending
   as a rollback. A visual-only frontend rollback must keep its v3 send integration. Disable sending if necessary; reconcile outstanding v3 rows
   before any reviewed schema retirement. This package contains no destructive rollback.

Offline test command:

`node --test tests/commercial-mail-send.test.mjs`

Tests inject repository, Auth, Storage, provider and HTTP fixtures. They require no
network, credentials, database connection or paid service. SQL assertions are static,
not proof of execution against PostgreSQL.

## Documentation verified on 2026-10-11

- [Supabase private bucket access model](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Auth context and RLS](https://supabase.com/docs/guides/functions/auth-legacy-jwt)
- [Supabase Storage download](https://supabase.com/docs/reference/javascript/storage-from-download)
- [Supabase changelog](https://supabase.com/changelog)
- [Resend send API and attachment ceiling](https://resend.com/docs/api-reference/emails/send-email)
- [Resend 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend attachment content_type schema](https://github.com/resend/resend-openapi/blob/main/resend.yaml)
