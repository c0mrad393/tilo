-- Runs once, as the superuser, when the database is first created.
-- Sets the passwords of the roles Supabase's image ships with, and adds tilo_api.

\set pgpass `echo "$POSTGRES_PASSWORD"`
\set jwt_exp `echo "$JWT_EXP"`

alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';

alter database postgres set "app.settings.jwt_exp" to :'jwt_exp';

-- tilo-api's own login. It skips row-level security because it checks everything itself
-- (who is asking, what they send) before it writes; the grants are in migrations/.
create role tilo_api with login bypassrls password :'pgpass';
