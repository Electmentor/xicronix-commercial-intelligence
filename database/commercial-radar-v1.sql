-- Radar Comercial Xicronix v1.0
-- Source-of-truth companion for Supabase migrations already applied on 2026-09-22.
-- Adds a pre-lead intelligence layer without replacing CRM entities.

-- Objects created in Supabase:
-- public.commercial_radar_profiles
-- public.commercial_radar_signals
-- public.commercial_radar_evidence
-- public.commercial_radar_dashboard
-- private.radar_score_signal() + trigger trg_radar_score_signal
--
-- Business rules:
-- 1) Private schools only for this MVP.
-- 2) Existing laboratory or verifiable laboratory project required.
-- 3) S/ 50k minimum reference; S/ 200k ideal ticket.
-- 4) Weighted score: fit 15, evidence 15, need 15, budget 20,
--    decision access 15, timing 10, size 5, logistics 5.
-- 5) CRITICAL requires score >= 90 plus budget, decision-maker access,
--    strong evidence, strong need and strong timing.
-- 6) Radar is read-only in the CRM UI. No automatic contact or lead creation.

select 'Radar Comercial Xicronix v1.0 — schema applied through Supabase migrations commercial_radar_mvp_v1 and commercial_radar_dashboard_created_at_v2' as deployment_note;
