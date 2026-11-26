CREATE SCHEMA ethiosms;

CREATE TABLE ethiosms.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ethiosms.users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES ethiosms.tenants(id),
  username text NOT NULL UNIQUE CHECK (username = lower(username) AND length(username) BETWEEN 3 AND 80),
  password_hash text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE TABLE ethiosms.applications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES ethiosms.tenants(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE TABLE ethiosms.api_keys (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  key_hash text NOT NULL UNIQUE CHECK (length(key_hash) >= 64),
  prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (tenant_id, application_id) REFERENCES ethiosms.applications(tenant_id,id)
);
CREATE INDEX api_keys_application ON ethiosms.api_keys(tenant_id,application_id);

CREATE TABLE ethiosms.message_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  kind text NOT NULL CHECK (kind IN ('notification','otp','bulk')),
  priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  payload_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,application_id,id),
  UNIQUE (tenant_id,application_id,idempotency_key),
  FOREIGN KEY (tenant_id,application_id) REFERENCES ethiosms.applications(tenant_id,id)
);
CREATE INDEX message_jobs_history ON ethiosms.message_jobs(tenant_id,created_at DESC,id);
CREATE TABLE ethiosms.message_recipients (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  phone_number text NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  segments integer NOT NULL CHECK (segments BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','accepted','sent','delivered','failed','expired','unknown','cancelled')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_message_id text,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,job_id,phone_number),
  CHECK ((status = 'claimed' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR
         (status <> 'claimed' AND lease_token IS NULL AND lease_expires_at IS NULL)),
  FOREIGN KEY (tenant_id,job_id) REFERENCES ethiosms.message_jobs(tenant_id,id)
);
CREATE INDEX recipients_due ON ethiosms.message_recipients(available_at,id) WHERE status = 'queued';
CREATE INDEX recipients_leases ON ethiosms.message_recipients(lease_expires_at) WHERE status = 'claimed';
CREATE INDEX recipients_history ON ethiosms.message_recipients(tenant_id,job_id);
CREATE TABLE ethiosms.message_attempts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('started','accepted','rejected','unknown')),
  provider_message_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,recipient_id,attempt_number),
  FOREIGN KEY (tenant_id,recipient_id) REFERENCES ethiosms.message_recipients(tenant_id,id)
);
CREATE TABLE ethiosms.otp_challenges (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  job_id uuid,
  phone_number text NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 80),
  code_digest text NOT NULL CHECK (length(code_digest) >= 64),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (attempts <= max_attempts),
  FOREIGN KEY (tenant_id,application_id) REFERENCES ethiosms.applications(tenant_id,id),
  FOREIGN KEY (tenant_id,application_id,job_id) REFERENCES ethiosms.message_jobs(tenant_id,application_id,id)
);
CREATE INDEX otp_lookup ON ethiosms.otp_challenges(tenant_id,application_id,phone_number,purpose,created_at DESC);
CREATE INDEX otp_expiry ON ethiosms.otp_challenges(expires_at);

-- Counters and reservations are structural foundations; atomic quota enforcement arrives in Task 4.
CREATE TABLE ethiosms.usage_counters (
  scope text NOT NULL CHECK (scope IN ('global','tenant','application')),
  scope_id uuid NOT NULL,
  usage_date date NOT NULL,
  reserved_segments bigint NOT NULL DEFAULT 0 CHECK (reserved_segments >= 0),
  used_segments bigint NOT NULL DEFAULT 0 CHECK (used_segments >= 0),
  PRIMARY KEY (scope,scope_id,usage_date)
);
CREATE TABLE ethiosms.usage_reservations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  usage_date date NOT NULL,
  segments integer NOT NULL CHECK (segments > 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','consumed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,job_id),
  FOREIGN KEY (tenant_id,job_id) REFERENCES ethiosms.message_jobs(tenant_id,id)
);
CREATE TABLE ethiosms.audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES ethiosms.tenants(id),
  actor_user_id uuid,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES ethiosms.users(tenant_id,id)
);
CREATE INDEX audit_history ON ethiosms.audit_events(tenant_id,created_at DESC,id);
CREATE TABLE ethiosms.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  sending_paused boolean NOT NULL DEFAULT true,
  message_retention_days integer NOT NULL DEFAULT 30 CHECK (message_retention_days BETWEEN 1 AND 365),
  otp_retention_hours integer NOT NULL DEFAULT 24 CHECK (otp_retention_hours BETWEEN 1 AND 168),
  audit_retention_days integer NOT NULL DEFAULT 90 CHECK (audit_retention_days BETWEEN 1 AND 730)
);
INSERT INTO ethiosms.settings(singleton) VALUES (true);
