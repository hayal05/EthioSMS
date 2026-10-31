-- Keep opaque request identity after message-content retention to prevent stale retries resending.
CREATE TABLE ethiosms.request_history (
 tenant_id uuid NOT NULL,application_id uuid NOT NULL,idempotency_key text NOT NULL,
 request_hash text NOT NULL CHECK(length(request_hash)=64),message_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,application_id,idempotency_key),
 FOREIGN KEY(tenant_id,application_id) REFERENCES ethiosms.applications(tenant_id,id)
);
INSERT INTO ethiosms.request_history(tenant_id,application_id,idempotency_key,request_hash,message_id,created_at)
 SELECT tenant_id,application_id,idempotency_key,request_hash,id,created_at FROM ethiosms.message_jobs;
