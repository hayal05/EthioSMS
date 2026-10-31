# EthioSMS initial pilot plan

## Goal and boundaries

Provide SMS notifications, OTP verification, and small consent-based bulk sends for the owner and 2–5 invited users, initially using one dedicated Android phone and SIM. User counts and quotas are planning defaults, adjustable after measurement. This is a controlled pilot without public signup or availability promises.

Proposed stack: TypeScript, Node.js/Express, React/Vite, PostgreSQL on Neon, one Render web service serving the API and built dashboard. Reuse an existing Android gateway app; do not build a custom Android app. Start with a mock adapter, then validate SMS Gateway for Android's public-cloud integration before committing to that provider. Its standard private server requires MySQL/MariaDB, not Neon.

Default safeguards: SMS sending disabled until explicitly configured; invited accounts only; initial live recipient allowlist; configurable per-user and global segment quotas; manual campaign approval; emergency pause. Initial proposed limits: 50 segments/user/day, 200 globally/day, and 20 recipients/bulk job. These are conservative product defaults, not statements of carrier capacity or permission. Confirm operator terms before live tests.

## Tasks

### Task 1 — Project foundation

- Create backend/frontend structure, scripts, environment validation, example configuration, and secret exclusions.
- Add a lightweight /health endpoint without database access and an authenticated readiness check.
- Add CI for type checks, relevant tests, and production build; use a lockfile.
- Default to mock gateway and SMS disabled.

Done when: a clean checkout installs and builds, CI passes, and no credentials are committed.

### Task 2 — Database and durable state

- Add versioned migrations for users, applications, API keys, message jobs/recipients, attempts, OTP challenges, usage reservations, audit events, and settings.
- Use pooled Neon connections and transactions; store timestamps in UTC and display dashboard times in Africa/Addis_Ababa.
- Define tenant ownership, unique request identifiers, indexes, expiry, and configurable retention.
- Persist all pending work in PostgreSQL; no queue reliance on local files or memory.

Done when: migrations work on a fresh database and queue/account data survives process restarts.

### Task 3 — Admin and invited users

- Securely bootstrap the first administrator without a hardcoded password.
- Admin creates/invites users; single-use expiring setup tokens; password hashing, secure sessions, login limits, and logout.
- Admin can disable users and applications; support a documented manual account recovery flow.
- Enforce user/admin roles and tenant isolation on all data access.

Done when: two users cannot view or modify each other's resources, and disabling access takes effect.

### Task 4 — Developer applications and API keys

- Users create named applications and issue, rotate, and revoke scoped API keys.
- Reveal raw keys once; store only secure hashes and safe prefixes.
- Apply application/user/global rate limits and quotas, with atomic usage reservation.
- Normalize phone numbers to E.164 with pilot defaults for Ethiopian numbers; configurable destination restrictions.

Done when: revoked or wrong-scope keys fail and concurrent requests cannot exceed quota.

### Task 5 — SMS API and mock gateway

- Implement POST /api/v1/messages and tenant-scoped GET message status/list endpoints.
- Validate message lengths, recipients, expiry, and idempotency keys; identical repeated requests return the original result, conflicting reuse is rejected.
- Estimate GSM-7/Unicode segment usage, including Amharic, and apply quotas by segments.
- Return accepted/queued status and message ID, not a claim of delivery.
- Mock success, rejection, timeout, offline, and delayed-status scenarios.

Done when: integrations can submit and track mock messages with clear errors and no accidental live send.

### Task 6 — Reliable dispatch and recovery

- Implement database-backed job claims with leases, bounded batches, OTP priority, expiry, and backoff.
- Use one controlled dispatcher within the web process for the pilot; provide an authenticated bounded drain mechanism for recovery. No separate always-on worker is assumed on free hosting.
- Trigger dispatch on submission and process due work while awake; document that sleeping hosting delays scheduled work. Avoid tight empty-queue polling or frequent idle database keepalives.
- Recover abandoned leases after restarts and support global pause/resume.
- Handle ambiguous provider timeouts as unknown/reconciliation-needed; do not blindly retry a message that may already have been sent. Use provider deduplication where verified; do not promise exactly-once delivery.

Done when: restart, concurrency, timeout, and expiry tests preserve jobs without uncontrolled duplicate sending.

### Task 7 — Existing Android gateway integration

- Verify current API/authentication, device setup, multipart behavior, message identifiers, status callbacks, and plan limits against provider documentation.
- Implement provider adapter and protect credentials through environment secrets.
- Configure phone permissions, charging, network, background behavior, SIM selection, and a setup checklist.
- Authenticate callbacks using verified provider mechanisms; if unavailable, use server-side authenticated status reconciliation. Make status updates idempotent and order-aware.
- Distinguish queued, provider accepted, sent, delivery confirmed, failed, expired, and unknown. Report last confirmed gateway contact rather than inventing device-online certainty.

Done when: a few explicitly authorized allowlisted messages send from the SIM and statuses reconcile. If live testing is not authorized/configured, deliver a mock-verified integration and record this gate as pending.

### Task 8 — OTP service

- Add request/verify endpoints bound to tenant, application, recipient, and purpose.
- Generate codes cryptographically; store keyed verification digests with a server secret, not raw codes. Protect any temporary message payload containing a code with encryption and prompt deletion after dispatch/expiry.
- Default to 5-minute expiry, 60-second resend cooldown, and 5 verification attempts; make policies configurable within safe bounds.
- Single-use atomic verification; invalidate superseded challenges; rate-limit requests and verification by key, recipient, and IP.
- Prioritize OTPs, prevent sending expired challenges, and avoid leaking codes into logs or dashboards.

Done when: expired, reused, superseded, wrong-purpose, and over-limit challenges fail reliably.

### Task 9 — Compact dashboards

- User: send message, application/API key management, status/history, daily segment usage, and quota remaining.
- Admin: invited users, account restrictions, global usage, queue failures, last gateway contact, and emergency pause.
- Mask recipient numbers by default, restrict message-body access, redact OTP bodies, and log administrative changes.
- Clear mobile/desktop layout, pagination, loading/error states, and no misleading delivery indicators.

Done when: owner and invited users can perform normal pilot operations without database or shell access.

### Task 10 — Small bulk sends

- Allow paste/CSV recipient input, normalization, deduplication, preview, and segment estimate.
- Enforce configurable batch caps, consent confirmation, per-user suppression lists, and manual admin approval before dispatch.
- Provide a practical opt-out path for campaigns and record suppressions; automatic inbound STOP handling is optional only if incoming-SMS support is verified and configured.
- Cancel unsent recipients and keep bulk traffic below OTP priority.
- Immediate batches only in the pilot; advanced scheduling and recurring campaigns are deferred.

Done when: duplicate/suppressed recipients are excluded, quotas are reserved safely, and cancellation leaves dispatched messages accurately recorded.

### Task 11 — Integration docs and first ERP connection

- Document authentication, request/response examples, status meanings, idempotency, error codes, OTP flow, and quotas.
- Provide curl and JavaScript examples with placeholders; no real credentials or phone numbers.
- Add one ERP integration example for a leave-status notification; keep real ERP repository changes separately scoped and authorized.
- Explain SMS content privacy, test mode, and failure handling.

Done when: a developer can integrate using documentation and a pilot key without receiving gateway credentials.

### Task 12 — Pilot deployment and validation

- Prepare Render configuration, frontend build/server routing, Neon migration instructions, and environment checklist.
- Add uptime health monitoring guidance, redacted logs, retention cleanup, backup/export and restore instructions, and rollback procedure.
- Keep health pings independent of database access. Document free-tier quota, restart, cold-start, and scheduled-work limitations; do not guarantee continuous uptime through a monitor.
- Deploy and enable live sending only after explicit authorization and configuration.
- Run a controlled pilot: owner first, then 2–5 invited users; measure actual accepted-to-sent/delivery timings, segment counts, failures, gateway disconnects, OTP expiry, and quota usage.
- Exercise phone offline, backend restart, provider timeout, duplicate request, simultaneous quota use, tenant isolation, expired OTP, and emergency pause scenarios.

Done when: all applicable acceptance checks pass and unresolved operational limits are recorded before expanding users.

## Deferred until after the pilot

Public signup; automated payments and commercial credit billing; subscriptions; advanced campaign scheduling; large contact CRM; multiple-device routing/failover; branded sender IDs; custom Android app; self-hosted private gateway infrastructure; availability guarantees. Usage tracking and segment quotas are included now, even though paid billing is deferred.

## Completion rules

Implement tasks sequentially, keep changes reviewable, and update this checklist/status as work proceeds. CI validates each implementation step before starting dependent work. This document authorizes planning only; no implementation, deployment, or live sending is performed by creating it.

## Progress

- [x] Task 1: Foundation — implemented and CI verified (PR #1)
- [ ] Task 2: Database
- [ ] Task 3: Invited users
- [ ] Task 4: API keys and quotas
- [ ] Task 5: SMS API and mock gateway
- [ ] Task 6: Dispatch and recovery
- [ ] Task 7: Android gateway integration
- [ ] Task 8: OTP service
- [ ] Task 9: Dashboards
- [ ] Task 10: Small bulk sends
- [ ] Task 11: Integration documentation
- [ ] Task 12: Deployment and pilot validation
