-- Ephemeral PostgreSQL compatibility layer for CI only.
-- Emulates the tiny portion of Supabase Auth/RLS context used by DEV migrations.

do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role anon;
exception when duplicate_object then null;
end $$;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
