ALTER TABLE ethiosms.users ADD COLUMN email text CHECK(email=lower(email) AND length(email)<=254);
CREATE UNIQUE INDEX users_unique_email ON ethiosms.users(email) WHERE email IS NOT NULL;
-- Existing admin role keeps its permissions; exactly one master administrator is allowed.
CREATE UNIQUE INDEX users_single_master_admin ON ethiosms.users(role) WHERE role='admin';
