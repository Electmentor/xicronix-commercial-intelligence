-- Applied to Supabase as crm_milestones_and_structured_movements_v1.
-- Defines six evidence-based commercial milestones and structured movement metadata.
-- No passwords, emails, documents or customer message bodies are stored by this migration.

alter table public.leads
  add column if not exists commercial_milestone text,
  add column if not exists maturity_percent integer not null default 0,
  add column if not exists milestone_updated_at timestamptz,
  add column if not exists milestone_updated_by uuid references auth.users(id);

-- Valid milestone values: M1=15, M2=30, M3=50, M4=70, M5=85, M6=100.
-- The production migration also adds checks, helper functions, indexes and
-- crm_apply_milestone_from_activity, which advances a lead only when a
-- recorded action is an explicit milestone event. It never advances for
-- ordinary email/call volume alone.

alter table public.activities
  add column if not exists action_code text,
  add column if not exists milestone_after text,
  add column if not exists maturity_after integer,
  add column if not exists evidence_note text;

-- Milestone action mapping used by the database trigger:
-- LEAD_QUALIFIED         -> M1 / 15
-- SCOPE_VALIDATED        -> M2 / 30
-- PROPOSAL_PRESENTED     -> M3 / 50
-- NEGOTIATION_STARTED    -> M4 / 70
-- FORMAL_COMMITMENT      -> M5 / 85
-- PURCHASE_ORDER_RECEIVED-> M5 / 85
-- CONTRACT_SIGNED        -> M5 / 85
-- SALE_WON               -> M6 / 100
--
-- Other structured movements remain evidence in the timeline but do not
-- increase maturity by themselves.
