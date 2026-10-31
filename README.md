# EthioSMS

An invite-only SMS pilot for ERP systems and locally developed applications. Node.js/Express + TypeScript, React/Vite, Neon PostgreSQL, and an existing Android SMSGate app. One server serves the dashboard and API.

The implementation covers accounts, developer keys, quotas, encrypted SMS requests, durable dispatch, OTP verification, reviewed small campaigns, operational controls and deployment preparation. **Mock is the default. No deployment or real SMS sending has been activated.** Physical phone/provider and real-host pilot validation remain pending.

## Guides

- [Pilot task plan](PILOT_PLAN.md) and [project status](PROJECT_STATUS.md)
- [API integration guide](docs/API.md) and [OpenAPI contract](docs/openapi.json)
- [Android gateway and controlled live-test setup](docs/ANDROID_GATEWAY.md)
- [Render/Neon operations, retention, backup and rollback](docs/OPERATIONS.md)
- [Pilot acceptance checklist](docs/PILOT_CHECKLIST.md)
- [Server-side ERP example](examples/erp-leave-notification.mjs)

## Run locally

Requires Node.js 22.12+ and npm. From the repository root:

```sh
npm ci
cp .env.example .env
npm run check
npm run build
npm start
```

Open http://localhost:3000. Without a database, the public shell and liveness work but account/message features are unavailable. For a functional mock pilot, configure a private DATABASE_URL and independent random hexadecimal PAYLOAD_ENCRYPTION_KEY and OTP_SECRET in .env, then:

```sh
npm run db:migrate
npm run admin:bootstrap -- your_admin_username
npm run build
npm start
```

For the deployed website, set a private `ADMIN_SETUP_KEY` in the hosting environment before the first administrator exists. Generate a strong value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, add it as a Render environment variable, and redeploy. The site then shows **Create Master Admin** automatically. Enter a username, a password (12–128 characters), confirmation, and the private setup key. Creation is atomic and the server permanently closes this first-admin route once any administrator exists. Do not put the key in frontend variables or commit it. The offline `npm run admin:bootstrap -- your_admin_username` path remains available for trusted database operators; it creates a private 24-hour setup token. `npm run admin:recover -- your_admin_username` remains the trusted offline administrator recovery path. Ordinary-user invitations and recovery remain in the admin panel.

For development run `npm run dev:api` and `npm run dev:web` separately. Vite proxies /api and /health to port 3000; change its proxy if changing the API port.

## Pilot behavior

- Invited users have separate tenants; applications start disabled until admin approval. Each account can have 20 applications and each app five active scoped keys. Raw keys appear once; only hashes/prefixes are stored. Rotation immediately revokes the old key.
- Defaults: 200 global / 50 account / 50 application segments per Addis Ababa day; per-minute request limits apply at key, application, account and platform levels. Settings are adjustable by the administrator. Quota reservation and queue storage are atomic; idempotent retries do not double-charge.
- Message text is encrypted at rest; normal API/history responses omit content and mask recipients. OTPs use separate keyed digests, single use, expiry, purpose/application binding, cooldown and attempt limits. Code payloads are removed after processing or invalidation.
- Dispatch starts paused. Admins can pause/resume and run a bounded recovery pass. Claims use leases, uncertain outcomes are not blindly resent, and definite offline failures retry with a cap. Known work schedules timers; idle queues do not continuously poll. Sleep/restart recovery is best effort on free hosting.
- Campaigns accept one-column CSV/paste input, deduplicate and suppress opt-outs, cap eligible recipients at 20, append opt-out instructions, record consent, and require admin review/approval. Cancel/reject only affects unsent recipients. Automatic inbound STOP processing is not configured.
- Every receipt carries mock/live mode. “Queued” is not “sent”; simulated delivery is not physical delivery. Live transport requires explicit flags, exact recipient allowlist, encryption, device and credentials. See the Android guide before configuring it.

## Configuration and checks

Use .env.example; never commit .env, keys, OTPs or gateway credentials, and never put them in VITE_* variables. Remote PostgreSQL uses certificate-verifying TLS; use the Neon pooled endpoint. Production sessions require HTTPS and READINESS_TOKEN. Trust proxy settings must match the actual host.

`GET /health` is public, database-free liveness. `GET /api/ready` needs `Authorization: Bearer READINESS_TOKEN` and returns 200 only for the expected database migration history; it does not confirm phone readiness. Production builds serve only the intended frontend routes and static assets.

`npm run check` runs type checks, unit/integration tests and production builds. Local PostgreSQL suites require an explicitly selected disposable localhost TEST_DATABASE_URL ending in `_test`; they DROP the test schema. Without it those database tests are skipped locally. CI requires PostgreSQL, runs all suites, and verifies a disposable queue through pg_dump/pg_restore and a PostgreSQL restart. CI HTTP transport tests are simulated and never send real SMS.

Migrations are explicit and checksummed; do not edit applied SQL. Run deliberate maintenance daily during the pilot via the admin control or `npm run db:maintain`; defaults are 30-day message history, 24-hour expired OTP metadata and 90-day audit retention. Back up data and secrets before migrations and rehearse restoration with dispatch paused. See the operations guide for the complete process.

Public registration, paid billing/credits, recurring campaigns, branded sender IDs, multi-device failover, custom Android development and availability guarantees are deferred. Operator approval and actual SIM/package capacity must be confirmed before commercial automated sending.
