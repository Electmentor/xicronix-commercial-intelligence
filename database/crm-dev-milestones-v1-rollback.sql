-- DEV only. Stop future automatic advancement, preserve recorded evidence and values.
drop trigger if exists crm_apply_milestone_from_activity on public.activities;
drop function if exists private.crm_apply_milestone_from_activity();
-- Intentionally retain the four additive columns and milestone values for audit.
