-- Applied as restore_complaints_admin_select_for_crm_v2 on 2026-09-18.
-- Existing console SELECT calls failed because table grants were missing.
-- Preserves administrator-only RLS, does not grant writes or change records.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.organizations) <> 1 THEN
    RAISE EXCEPTION 'Review tenant scoping before enabling complaint console reads';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('complaints','complaint_events') AND c.relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'Both complaint tables must retain RLS';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND ((tablename='complaints' AND policyname='complaints_admin_read')
        OR (tablename='complaint_events' AND policyname='complaint_events_admin_read'))
      AND cmd='SELECT' AND qual='private.current_user_is_complaints_admin()') <> 2 THEN
    RAISE EXCEPTION 'Expected existing administrator policies were not found';
  END IF;
END;
$$;
GRANT SELECT ON public.complaints, public.complaint_events TO authenticated;
-- Verified: existing ADMIN can read 3 cases and 6 events; unlinked authenticated sees 0.
-- Verified: anon has no SELECT grant; authenticated has no direct UPDATE privilege.
-- Rollback of this grant only, if required:
-- REVOKE SELECT ON public.complaints, public.complaint_events FROM authenticated;
-- Do not apply rollback automatically: it disables the existing admin console again.
