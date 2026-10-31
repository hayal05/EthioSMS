# EthioSMS

SMS gateway platform for ERP systems, websites, and locally developed applications. Planned services include OTP verification, transactional notifications, and consent-based bulk messaging through an existing Android SMS gateway app and SIM.

## Status

Task 1 foundation implemented: TypeScript Express backend, React/Vite dashboard shell, validated configuration, protected readiness, and CI. Database integration, accounts, and messaging are pending. No live SMS sending is enabled.

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
- `GET /api/ready`: requires `Authorization: Bearer <READINESS_TOKEN>`. Configure a private random token of at least 32 characters; it is mandatory with `NODE_ENV=production`. This endpoint describes foundation readiness only, not database or phone readiness.
- `SMS_GATEWAY=mock` and `SMS_ENABLED=false` are the only supported values. Enabling real sending fails startup in this release. No send endpoint is exposed yet.
- `.env` is read by backend start/development scripts; production environment variables can also be supplied by the hosting provider. Never put readiness or gateway credentials in frontend `VITE_*` variables.
- `npm run check` runs TypeScript checks, backend integration tests, and production builds. CI runs the same command after `npm ci`.

The dashboard is a public foundation status page, not an authenticated customer dashboard. It displays no account, message, or recipient data. The built dashboard and API share one server process. Database, sending, authentication, and deployment arrive in later tasks from [PILOT_PLAN.md](PILOT_PLAN.md).
