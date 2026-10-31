ALTER TABLE ethiosms.message_jobs ADD COLUMN approval_required boolean NOT NULL DEFAULT false,ADD COLUMN approved_at timestamptz;
CREATE TABLE ethiosms.campaigns (
 job_id uuid PRIMARY KEY REFERENCES ethiosms.message_jobs(id),tenant_id uuid NOT NULL,application_id uuid NOT NULL,
 consent_note text NOT NULL CHECK(length(trim(consent_note)) BETWEEN 5 AND 500),opt_out_instructions text NOT NULL CHECK(length(trim(opt_out_instructions)) BETWEEN 5 AND 300),
 submitted_by uuid NOT NULL,approved_by uuid REFERENCES ethiosms.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,application_id,job_id) REFERENCES ethiosms.message_jobs(tenant_id,application_id,id),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES ethiosms.users(tenant_id,id)
);
CREATE TABLE ethiosms.suppressions (
 tenant_id uuid NOT NULL REFERENCES ethiosms.tenants(id),phone_number text NOT NULL CHECK(phone_number ~ '^\+[1-9][0-9]{7,14}$'),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,phone_number)
);
