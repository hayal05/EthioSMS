# EthioSMS

SMS gateway platform for ERP systems, websites, and locally developed applications. Planned services include OTP verification, transactional notifications, and consent-based bulk messaging through an existing Android SMS gateway app and SIM.

## Status

Task 1 foundation implemented: TypeScript Express backend, React/Vite dashboard shell, validated configuration, protected readiness, and CI. Database migrations and internal message persistence are now implemented in Task 2. Invite-only accounts are implemented in Task 3. Developer keys and quotas are implemented in Task 4, and encrypted mock message APIs in Task 5. No live SMS sending is enabled.

## Planned features

- Customer registration and administrator approval.
- Separate API keys, tenant isolation, permissions, quotas, and rate limits.
- Single messages, bulk campaigns, scheduling, and message history.
- OTP generation and verification with expiry, resend limits, and attempt limits.
- Durable message queue, OTP priority, duplicate protection, and controlled retries.
- Message status tracking and authenticated webhooks where supported.
- Contact imports, consent records, and campaign opt-outs.
- Customer and administrator dashboards.
- Credits, manual payment approval, and usage statements.
- Gateway connectivity monitoring and operational alerts.

## Proposed architecture

Customer application -> EthioSMS HTTPS API -> PostgreSQL message queue -> gateway adapter -> existing Android gateway app -> SIM/mobile network -> recipient.

Customers receive their own EthioSMS API keys. Gateway credentials remain private to the backend. A provider adapter allows future operator-approved SMS connections without changing customer integrations.

## Pilot hosting

- Render: backend API and dashboard.
- Neon PostgreSQL: accounts, API key hashes, message jobs, OTP verification records, and credit ledger.
- Existing Android gateway app: SMS transmission through the SIM.
- Uptime monitor: lightweight health checks without database queries.

Render Free may sleep or restart; an uptime monitor does not guarantee availability. Persist jobs in PostgreSQL rather than memory or local files, and avoid continuous idle database polling. Upgrade hosting before promising dependable public OTP delivery.

SMS Gateway for Android's standard private server requires MySQL/MariaDB, so Neon cannot directly host that component's database. An initial integration may use its public cloud API; private deployment needs compatible infrastructure. Final gateway selection remains pending.

## Implementation sequence

1. Backend foundation, configuration, migrations, and health endpoint.
2. Customer authentication, approval, tenant isolation, and API keys.
3. Durable message queue, gateway adapter, delivery status, and duplicate protection.
4. OTP endpoints, expiry, priority, and abuse controls.
5. Customer/admin dashboards and usage reporting.
6. Bulk campaigns, scheduling, contacts, and opt-outs.
7. Credits, manual payment approval, API documentation, and pilot deployment.

## Operational requirements

Use HTTPS, keep credentials out of source control, and redact OTPs and secrets from logs. Confirm operator permission and package coverage before automated commercial sending. A personal unlimited SMS package alone does not establish permission to operate a public messaging service. Measure actual throughput and reliability on the selected phone and network.

## Run the foundation

Requires Node.js 22.12+ and npm. From the repository root:

```sh
npm ci
cp .env.example .env
npm run check
npm run build
npm start
```

Open http://localhost:3000. For development, run `npm run dev:api` and `npm run dev:web` in separate terminals; Vite proxies API/health requests to port 3000. If you change the API port, update the development proxy too.

### Health and configuration

- `GET /health`: public liveness, with no database or phone access. Use this for uptime checks.
- `GET /api/ready`: requires `Authorization: Bearer <READINESS_TOKEN>`. Configure a private random token of at least 32 characters; it is mandatory with `NODE_ENV=production`. This endpoint checks database migration readiness when configured; it does not imply phone readiness.
- `SMS_GATEWAY=mock` and `SMS_ENABLED=false` are the only supported values. Enabling real sending fails startup in this release. No send endpoint is exposed yet.
- `.env` is read by backend start/development scripts; production environment variables can also be supplied by the hosting provider. Never put readiness or gateway credentials in frontend `VITE_*` variables.
- `npm run check` runs TypeScript checks, backend integration tests, and production builds. CI runs the same command after `npm ci`.

The landing page displays public foundation status. The account panel loads private information only after session authentication; message and recipient data are not yet displayed. The built dashboard and API share one server process. Database setup is documented below; sending and deployment arrive in later tasks from [PILOT_PLAN.md](PILOT_PLAN.md).

## Database foundation (Task 2)

Set `DATABASE_URL` privately in the repository-root `.env` or hosting environment, using the Neon pooled URL (`-pooler` hostname) with `sslmode=verify-full`. A remote URL with `sslmode=require` is upgraded to certificate-verifying TLS. The server uses a small connection pool and releases idle connections; `/health` never queries it. No production database has been configured by this change.

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Migrations run explicitly, not automatically on startup. They apply in one transaction with a transaction-scoped advisory lock. The migration ledger detects edited, removed, or reordered applied files. Add a new numbered SQL migration instead of changing an applied migration. Back up before schema changes; use forward corrective migrations rather than dropping populated tables.

Protected `/api/ready` now returns 200 only when the configured database has the expected migration history; missing/unavailable/unmigrated databases return 503. Phone readiness is not implied. Liveness remains available without a database. The built migration command is also available as `node --env-file-if-exists=../.env dist/db/migrate.js` from `backend/` after building.

The `ethiosms` schema stores tenant accounts, users, applications, hashed API keys, encrypted message payload slots, recipient jobs/leases, attempts, OTP digests, usage counters/reservations, audit events, and retention settings. Foreign keys include tenant ownership. Internal message persistence is not an exposed sending API: authentication, encryption, quotas, and dispatch must be implemented before use by customers. Settings start with sending paused. Retention settings are stored now; automated cleanup arrives in Task 12. Timestamps use `timestamptz` (absolute instants); the dashboard will display Africa/Addis_Ababa time when dated records are introduced.

### Database verification

CI provisions a disposable PostgreSQL 17 database and requires the database tests. For local database tests, explicitly set `TEST_DATABASE_URL` to a disposable localhost PostgreSQL database whose name ends in `_test`, and set `REQUIRE_DATABASE_TESTS=true`, then run `npm run check`. These tests **drop the EthioSMS test schema and migration ledger**. Never point them at an application database. Without this test URL, only the database integration suite is skipped locally.

Tests cover concurrent migration runners, repeat migrations, checksums, transactional rollback, tenant/application boundaries, duplicate requests, invalid recipient rollback, and recovery after closing/reopening all application connections. Database server restart recovery is part of later deployment validation.

## Invited accounts (Task 3)

After configuring a private database and applying migrations, bootstrap the first administrator from a trusted terminal:

```sh
npm run db:migrate
npm run admin:bootstrap -- your_admin_username
```

The command creates the administrator only if none exists and prints a **private one-time setup token**, not a default password. Open the site, choose **I have a setup token**, and set a password of 12–128 characters. Sign in using the username and password. Do not run bootstrap in public build logs or share its output. No public signup is provided.

An administrator can create an invited username in the account panel and share its token privately. Tokens expire after 24 hours and are usable once; only their hashes are stored. Each invited account gets its own tenant. The administrator can disable/re-enable users or issue a recovery token; disabling or recovery revokes existing sessions immediately. Recovery also invalidates the previous password and previous setup tokens. Disabling a tenant blocks authentication. Password setup does not automatically sign the user in.

Sessions expire after 8 hours and use HttpOnly, SameSite=Strict cookies; production cookies are Secure and require HTTPS. Login throttles are persisted in PostgreSQL (30 attempts/IP and 10/username per 15-minute window); setup attempts are limited to 20/IP per window. Keep `TRUST_PROXY_HOPS=0` for direct local access; use `1` only when traffic must pass through one trusted reverse proxy such as Render. This determines which IP is used by throttling. No CORS is enabled. Cookie-authenticated mutations require `X-EthioSMS-Request: 1` to block cross-site form requests.

### Account API

| Method/path | Access | Purpose |
|---|---|---|
| POST `/api/auth/setup` | Setup token | JSON `token`, `password`; consume token and set password |
| POST `/api/auth/login` | Username/password | JSON `username`, `password`; sets session cookie |
| GET `/api/auth/me` | Session | Current user's safe identity |
| POST `/api/auth/logout` | Session cookie, if present | Revoke session and clear cookie |
| GET `/api/admin/users` | Admin | Latest 100 users, without credentials |
| POST `/api/admin/users` | Admin | JSON `username`; returns setup token once |
| PATCH `/api/admin/users/:id` | Admin | JSON boolean `enabled`; regular users only |
| POST `/api/admin/users/:id/recovery` | Admin | Revoke access and issue replacement setup token |
| PATCH `/api/admin/applications/:id` | Admin | JSON boolean `enabled`; application creation/API keys arrive in Task 4 |

All mutation requests require the custom header. Browser requests include it automatically in the account panel. Credentials are never returned by user-list or session endpoints. Administrators can manage regular users across tenants; ordinary users cannot access admin endpoints. Tenant-scoped application/message APIs are introduced in later tasks.

### Administrator recovery

If the administrator loses access, the trusted operator with private database access can run `npm run admin:recover -- your_admin_username`. This resets only the named administrator, revokes sessions, invalidates the old password and setup tokens, enables the account, and prints a new 24-hour setup token. Keep output private. Ordinary-user recovery uses the administrator panel instead. Expired sessions, tokens, and rate-limit buckets are retained until cleanup in Task 12; monitor database storage during the pilot.

## Applications, API keys, and quotas (Task 4)

Apply migration `003_developer_access.sql` with `npm run db:migrate`. Signed-in users can create named applications, issue scoped API keys, rotate keys, and revoke them in the developer panel. New applications start disabled until an administrator approves them; owners can disable an application but only an administrator can re-enable it. Pilot caps are 20 applications per account and five active keys per application. Application names are unique within an account, ignoring case.

Keys are random bearer secrets beginning with `esms_`. The full key appears only in the issue/rotation response and the current browser panel; it is not saved in browser storage or returned by list endpoints. Store it privately in the integrating application's **server** environment. Only SHA-256 hashes and short prefixes are saved in the database. Rotation atomically revokes the old key and returns a replacement with the same permissions; there is no overlap period. Disabling the account/application or revoking a key blocks subsequent key authentication.

Available permissions: `messages:send`, `messages:read`, `otp:request`, `otp:verify`, and `usage:read`. Mock message endpoints are documented in Task 5 below; OTP endpoints arrive in Task 8. The first developer API endpoint is:

```sh
curl https://YOUR-ETHIOSMS-HOST/api/v1/usage \
  -H 'Authorization: Bearer YOUR_PRIVATE_API_KEY'
```

It requires `usage:read` and reports only that application's and account's reserved/used/remaining segment counts for the Addis Ababa calendar day. It does not expose other customers' usage or imply that the global pool has capacity. API-key routes use bearer authentication; the custom browser mutation header applies to session-authenticated management routes.

| Session-authenticated path | Methods | Purpose |
|---|---|---|
| `/api/applications` | GET, POST | List own apps; create using JSON `name` |
| `/api/applications/:id` | PATCH | Rename or disable own app |
| `/api/applications/:id/keys` | GET, POST | Safe key metadata; issue with JSON `scopes` |
| `/api/applications/:id/keys/:keyId/rotate` | POST | Revoke old key and issue replacement |
| `/api/applications/:id/keys/:keyId` | DELETE | Revoke own key, idempotently |
| `/api/applications/:id/usage` | GET | Own application's usage |
| `/api/admin/applications` | GET | Admin application approval list |
| `/api/admin/limits` | GET, PATCH | Admin pilot limits and allowed destination prefixes |

Default segment quotas are **200 globally, 50 per account, and 50 per application per day**. Each invited user has one account, so the account quota is the pilot's user quota. Default request limits per minute are **120 globally, 60 per account, 30 per application, and 20 per key**. Rate counters are database-backed fixed windows, persist denied attempts, and apply to the currently available bearer usage endpoint; the same guard will be used by later SMS/OTP routes. Fixed windows can allow a burst across a window boundary. All seven limits and permitted destination prefixes can be updated together in the admin panel/API; daily quotas accept zero to block new reservations. Lowering a quota does not cancel already-reserved jobs.

Internal `reserveMessage` persists a new job, its recipients, and all three quota reservations within one PostgreSQL transaction. Concurrent requests cannot overspend a scope; rejected requests leave no new job or partial counter increment. Matching idempotency replays do not reserve twice. Task 5 exposes the guarded path through the mock submission API, calculating segment counts from actual text, canonicalizing the request fingerprint, and encrypting payloads. There is no separate public quota-reservation endpoint. The low-level persistence helper is not a public submission API. Reserved usage is retained until dispatch/failure/cancellation accounting is implemented in Task 6; it is not a claim of delivery or a financial charge.

Phone utilities normalize Ethiopian mobile inputs such as `0912345678`, `912345678`, `251912345678`, and `00251912345678` to E.164. Ethiopian pilot destinations must use a 7/9 mobile prefix. International E.164 syntax is accepted only if its prefix is allowed; by default only `+251` is allowed. This validates syntax and policy, not SIM ownership, carrier permission, or deliverability. Customer-facing phone submission arrives with Task 5.

## Mock SMS API (Task 5)

Apply the next migration with `npm run db:migrate`. Set `PAYLOAD_ENCRYPTION_KEY` privately to a randomly generated 32-byte key encoded as 64 lowercase hexadecimal characters. The `.env.example` shows a generation command. Missing encryption configuration blocks submissions with 503 while other account features remain available. Preserve the key securely while encrypted jobs exist; replacing or losing it prevents decryption. Key rotation/multi-key decryption is not implemented yet.

```sh
curl -X POST https://YOUR-ETHIOSMS-HOST/api/v1/messages \
  -H 'Authorization: Bearer YOUR_PRIVATE_API_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: erp-leave-event-123' \
  -d '{"to":"+251912345678","message":"Your leave request was approved.","expiresInSeconds":3600}'
```

This requires `messages:send`. A successful response is **202 Accepted**, a stable message ID, a Location header, `mode: "mock"`, the stored queue status, calculated segment count, and a masked destination. It does **not** mean an SMS was sent or delivered. Submissions are durably queued; dispatch is Task 6 and phone sending is Task 7. `SMS_ENABLED=false` remains mandatory. Only one recipient string is accepted per request; campaign/bulk submission with approval is deferred to Task 10.

Accepted JSON fields:

| Field | Rule |
|---|---|
| `to` | One mobile number; normalized and checked against permitted prefixes |
| `message` | Nonblank text; at most 1600 UTF-16 units and 10 calculated segments |
| `expiresInSeconds` | Integer 30–86400; default 3600 |
| `mockScenario` | Optional `success`, `rejected`, `timeout`, `offline`, or `delayed`; default `success` |

Unknown fields are rejected; callers cannot set tenant, application, kind, segment count, delivery status, or gateway mode. OTP creation/verification uses its own forthcoming Task 8 endpoints.

`Idempotency-Key` is required (1–128 ASCII letters, digits, dots, underscores, colons or hyphens). Reusing it within the same application for the same normalized destination/text/expiry duration/scenario returns the original job and original expiry, with no new quota reservation. A conflicting body returns 409. Supply a new key for a new business event. Replays do not extend expiry. Requests are still subject to current permissions, destination policy, and rate limits.

Message text and the chosen mock scenario are encrypted using AES-256-GCM with an application/tenant/request context. The canonical request fingerprint is a keyed HMAC to avoid storing a plain text fingerprint. Stored recipients remain available to dispatch in PostgreSQL, but public responses mask numbers and never return message text, ciphertext, or request fingerprints.

### Status and history

- `GET /api/v1/messages/:id` requires `messages:read` and returns only a job belonging to that key's tenant **and application**, with recipient statuses and segment totals.
- `GET /api/v1/messages?limit=20&cursor=...` requires `messages:read`; limit is 1–100. Use the returned opaque `nextCursor` until null. Cursor pagination preserves database timestamp precision. History includes status, segment totals, mock mode, creation time, and expiry without message content.
- `GET /api/v1/usage` still requires `usage:read` and reports reserved usage separately from used usage.

Errors: 400 invalid input/JSON, 401 invalid/revoked/disabled key, 403 missing permission, 404 inaccessible or missing job, 409 conflicting idempotency key, 413 oversized body, 415 unsupported content type, 429 request/segment limit, and 503 unavailable storage/configuration. Errors do not echo message bodies, keys, or database details.

Segment estimation uses GSM-7's 160/153-septet single/multipart limits and Unicode's 70/67 UTF-16-unit limits. GSM extension characters count twice; multipart boundaries preserve extension pairs and surrogate pairs. Amharic uses Unicode encoding. Estimates still require validation against the eventual phone/operator implementation, especially for complex Unicode grapheme sequences.

The pure mock adapter can simulate acceptance, definite rejection, an ambiguous timeout, an offline retryable result, and a delayed delivery result after 30 seconds. Submission stores the scenario encrypted but does not execute the adapter yet. Simulated outcomes will remain explicitly marked as mock; they must never be presented as real delivery confirmations. A queued job whose expiry passes will be expired by the Task 6 dispatcher; until then its stored status remains queued and its expiry is visible.
