CREATE UNIQUE INDEX applications_name_per_tenant ON ethiosms.applications(tenant_id,lower(name));
ALTER TABLE ethiosms.settings
  ADD COLUMN global_daily_segments integer NOT NULL DEFAULT 200 CHECK (global_daily_segments BETWEEN 0 AND 100000),
  ADD COLUMN tenant_daily_segments integer NOT NULL DEFAULT 50 CHECK (tenant_daily_segments BETWEEN 0 AND 100000),
  ADD COLUMN application_daily_segments integer NOT NULL DEFAULT 50 CHECK (application_daily_segments BETWEEN 0 AND 100000),
  ADD COLUMN key_requests_per_minute integer NOT NULL DEFAULT 20 CHECK (key_requests_per_minute BETWEEN 1 AND 10000),
  ADD COLUMN application_requests_per_minute integer NOT NULL DEFAULT 30 CHECK (application_requests_per_minute BETWEEN 1 AND 10000),
  ADD COLUMN tenant_requests_per_minute integer NOT NULL DEFAULT 60 CHECK (tenant_requests_per_minute BETWEEN 1 AND 10000),
  ADD COLUMN global_requests_per_minute integer NOT NULL DEFAULT 120 CHECK (global_requests_per_minute BETWEEN 1 AND 10000),
  ADD COLUMN allowed_destination_prefixes text[] NOT NULL DEFAULT ARRAY['+251'] CHECK (cardinality(allowed_destination_prefixes) BETWEEN 1 AND 20);
CREATE TABLE ethiosms.api_rate_limits (
  scope text NOT NULL CHECK (scope IN ('global','tenant','application','key')),
  scope_id uuid NOT NULL,
  bucket timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY(scope,scope_id,bucket)
);
CREATE INDEX api_rate_cleanup ON ethiosms.api_rate_limits(bucket);
ALTER TABLE ethiosms.api_keys ADD CONSTRAINT api_scopes_supported CHECK (
  cardinality(scopes) BETWEEN 1 AND 5 AND scopes <@ ARRAY['messages:send','messages:read','otp:request','otp:verify','usage:read']::text[]
);
