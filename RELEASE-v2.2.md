# CRM V2.2 — editor and intake corrections

## Approved scope

The founder requested a real web-form channel, working institution/contact selectors,
a review of edit fields, and removal of test prospects while preserving the one real
school request. This release builds on V2.1; it does not replace the advanced CRM.

## Application

- `WEB_FORM` / Formulario web is a supported interaction channel.
- `WEBSITE` is displayed as Formulario web for prospect origin.
- New interactions no longer assume a phone call, a first-contact subject or a result.
- Nullable result selectors explicitly show Sin registrar, not an invented first option.
- Institution changes filter/reset contacts; contact selection can fill its institution.
- Changing an interaction's prospect refreshes its linked institution and contact.
- Invalid relationship combinations are rejected rather than silently saved.
- Existing unknown options remain visible for review instead of silently replaced.
- Task edit forms now expose prospect and contact relationships.
- Validation covers required/select/date/integer fields and complete activity followups.
- Unedited date fields retain original seconds/milliseconds; the browser timezone is disclosed.
- Original intake interactions can be edited from their request detail, avoiding duplicate history.

## Database operation (completed separately)

A transaction with locks and explicit preconditions preserved the original school text,
linked its submitted institution/contact, corrected its intake activity to WEB_FORM, and
removed 15 test or noncommercial technical-email prospects and dependent test records.
The active CRM now has one prospect, one institution, one contact, one original interaction,
zero opportunities, and 14 tasks (including the 12 real implementation tasks).
No proposal, meeting, budget, sale, result, response or authority to purchase was fabricated.
The catalog, complaint cases/events, profiles and account credentials were not changed.

Before deletion, a complete rollback snapshot of the affected CRM tables was retained in
a private, non-API table with no anonymous/authenticated privileges. No customer data,
recovery tokens, credentials or snapshot contents are included in this public repository.

A separate schema migration adds WEB_FORM, normalizes future legacy automated website
intake notes to that channel, and checks institution/contact consistency on leads and
activities. It preserves row-level security and the existing account roles.

## Verification limits

Node tests and Chromium editor/navigation tests run with fictional isolated data. Production
asset hashes and real signed-out access are verified separately. Customer-linked state is
checked by database read queries. This is not a claim to have logged in as the founder.
One transactional negative database test was rejected by an existing relationship check;
the transaction was not committed and later read checks confirmed no test rows remained.

Do not deploy until the editor/navigation CI checks pass. Following a main merge, verify
production jobs before describing this version as publicly deployed.

## Deliberately unchanged

The optional, clearly marked local demonstration and software regression tests remain as
features/development assets, not sales data. Normal new customer inquiries remain enabled.
The mail-ingestion technical classification is not changed by this release; no source
email messages were deleted, and no customer emails/invitations were sent.
