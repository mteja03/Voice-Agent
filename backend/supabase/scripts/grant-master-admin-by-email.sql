-- Run once in Supabase SQL Editor (or psql) after verifying the account exists.
-- Platform admins can switch organizations and manage all tenants via /api/tenants.

update users
set platform_role = 'master_admin'
where lower(trim(email)) = lower(trim('mteja0852@gmail.com'));

-- Verify:
-- select id, email, platform_role from users where lower(trim(email)) = lower(trim('mteja0852@gmail.com'));
