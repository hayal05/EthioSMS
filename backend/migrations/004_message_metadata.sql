ALTER TABLE ethiosms.message_jobs
  ADD COLUMN encoding text CHECK (encoding IN ('GSM-7','UTF-16')),
  ADD COLUMN gateway_mode text NOT NULL DEFAULT 'mock' CHECK (gateway_mode = 'mock');
