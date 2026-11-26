ALTER TABLE ethiosms.message_recipients
 ADD COLUMN usage_settled boolean NOT NULL DEFAULT false,
 ADD COLUMN submitted_at timestamptz,
 ADD COLUMN reconcile_at timestamptz;
CREATE INDEX recipients_reconcile ON ethiosms.message_recipients(reconcile_at) WHERE status IN ('accepted','sent');
