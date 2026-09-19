-- Applied to production as crm_attention_alerts_and_single_intake_task_v1
-- 2026-09-18. No customer message is sent by this migration.

alter table private.cx_intake_routes
  add column if not exists sla_minutes integer not null default 1440;

alter table public.leads
  add column if not exists attention_due_at timestamptz,
  add column if not exists first_human_response_at timestamptz,
  add column if not exists routing_area text,
  add column if not exists routing_reason text;

create index if not exists leads_attention_due_idx
  on public.leads(organization_id, first_human_response_at, attention_due_at);

-- Production function private.cx_enqueue_web_intake_v1 now creates exactly one
-- canonical task with automation_key cx:web:<web_lead_id>, using the configurable
-- SLA from private.cx_intake_routes.sla_minutes.
--
-- Production function private.cx_activity_followup_v1 now explicitly ignores
-- WEB_FORM intake events so the initial form never creates a second task.
--
-- Production trigger private.cx_mark_first_human_response records the first
-- documented human interaction (EMAIL, CALL, WHATSAPP, MEETING, VISIT or
-- action_code RESPONSE_SENT) in leads.first_human_response_at.
--
-- Production trigger private.cx_link_web_intake_task links the canonical web task
-- to the CRM lead/institution/contact once web_leads.crm_record_id is available.
--
-- Existing duplicate cx:activity:* task for the real website lead was set to
-- CANCELLED rather than deleted, preserving history. The cx:web:* task remains active.
