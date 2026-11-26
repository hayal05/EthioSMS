ALTER TABLE ethiosms.otp_challenges ADD COLUMN request_key text,ADD COLUMN request_hash text;
CREATE UNIQUE INDEX otp_request_idempotency ON ethiosms.otp_challenges(tenant_id,application_id,request_key) WHERE request_key IS NOT NULL;
