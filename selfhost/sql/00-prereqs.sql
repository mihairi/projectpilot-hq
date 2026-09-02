-- Runs once, on first database start, before any application migration.
-- Creates the roles and schemas the auth service and data API expect.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- API roles
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login createrole noinherit;
  end if;
end $$;

-- give the API roles the same password as the database superuser
\getenv pw POSTGRES_PASSWORD
alter role authenticator with login password :'pw';
alter role supabase_auth_admin with login password :'pw';

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- helpers the application policies rely on (provided by the hosted platform)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'role','')::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'email','')::text
$$;
