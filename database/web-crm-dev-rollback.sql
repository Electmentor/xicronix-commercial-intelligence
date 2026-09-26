-- Optional operational rollback. DEV only; preserves every record and trace.
begin;
do $$ begin
  if not exists(select 1 from public.organizations where slug='xicronix-commercial-intelligence-dev') then raise exception 'DEV guard failed'; end if;
end $$;
revoke execute on function public.web_intake_dev_v1(jsonb) from service_role;
commit;
-- Recovery after verification: grant execute on function public.web_intake_dev_v1(jsonb) to service_role;
