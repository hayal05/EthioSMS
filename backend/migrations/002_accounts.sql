CREATE TABLE ethiosms.setup_tokens (
  token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  FOREIGN KEY (tenant_id,user_id) REFERENCES ethiosms.users(tenant_id,id)
);
CREATE INDEX setup_tokens_user ON ethiosms.setup_tokens(user_id);
CREATE INDEX setup_tokens_expiry ON ethiosms.setup_tokens(expires_at);
CREATE TABLE ethiosms.sessions (
  token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  FOREIGN KEY (tenant_id,user_id) REFERENCES ethiosms.users(tenant_id,id)
);
CREATE INDEX sessions_user ON ethiosms.sessions(user_id);
CREATE INDEX sessions_expiry ON ethiosms.sessions(expires_at);
CREATE TABLE ethiosms.auth_limits (
  key_hash text NOT NULL CHECK (length(key_hash)=64),
  bucket timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (key_hash,bucket)
);
CREATE INDEX auth_limits_cleanup ON ethiosms.auth_limits(bucket);
