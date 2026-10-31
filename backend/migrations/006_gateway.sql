ALTER TABLE ethiosms.message_jobs DROP CONSTRAINT message_jobs_gateway_mode_check;
ALTER TABLE ethiosms.message_jobs ADD CONSTRAINT message_jobs_gateway_mode_check CHECK (gateway_mode IN ('mock','live'));
CREATE TABLE ethiosms.gateway_health(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),last_api_contact_at timestamptz);
INSERT INTO ethiosms.gateway_health(singleton) VALUES(true);
