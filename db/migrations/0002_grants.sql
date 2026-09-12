-- Grant the API role access to the tables.
--
-- The project was created with "Automatically expose new tables" OFF, which is
-- the right default: it stops a new table silently becoming reachable from a
-- browser key. But it also means each table must be granted deliberately, or
-- the Data API returns 403 even to the server.
--
-- Only service_role is granted, and only server routes hold that key. anon and
-- authenticated get nothing, so a browser cannot reach these tables at all —
-- which is the access model in ARCHITECTURE.md §6.

grant usage on schema public to service_role;

grant all privileges on table splits   to service_role;
grant all privileges on table events   to service_role;
grant all privileges on table feedback to service_role;

grant usage, select on all sequences in schema public to service_role;

-- Explicitly deny the browser-facing roles, in case a future default changes.
revoke all on table splits   from anon, authenticated;
revoke all on table events   from anon, authenticated;
revoke all on table feedback from anon, authenticated;
