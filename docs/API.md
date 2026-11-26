# EthioSMS developer API

Use an approved application and a scoped EthioSMS key (`esms_…`) from your signed-in workspace. Keep keys on your backend. They are different from the gateway's own SMSGate credentials. Never embed them in a browser, APK, repository or URL query. The reference contract is [openapi.json](openapi.json).

## First request

```sh
curl -X POST https://YOUR-HOST/api/v1/messages \
 -H 'Authorization: Bearer YOUR_ETHIOSMS_KEY' \
 -H 'Content-Type: application/json' \
 -H 'Idempotency-Key: leave-change-event-123' \
 -d '{"to":"+251912345678","message":"Your leave request was approved."}'
```

202 means accepted into the durable queue, not sent. Retain the message ID and check GET `/api/v1/messages/ID` using `messages:read`. `mode: mock` denotes simulated transport and simulated receipts. Live mode is separately gated and allowlisted. GET `/api/v1/usage` requires `usage:read`. History is GET `/api/v1/messages?limit=20&cursor=OPAQUE_CURSOR` with `messages:read`; follow nextCursor until null.

A message request requires `messages:send`, one destination string, nonblank message text, optional `expiresInSeconds` (30–86400, default 3600), and optional mockScenario in mock mode. Server-side GSM/Unicode segment calculations determine quota usage. One message is capped at ten segments and 1600 UTF-16 units. Marketing campaigns use the reviewed session workspace flow, not a recipient array on this endpoint.

Use the same Idempotency-Key for retries of the same business event. Do not generate a new key when a request times out: its outcome may already be accepted. Same-key/same-normalized-body requests return the original job/expiry; conflicts return 409. Daily quota counts are not doubled on replay. Keys are scoped to each application. The `otp:` and `bulk:` idempotency namespaces are reserved for internal use.

## Status interpretation

| Status | Meaning |
|---|---|
| queued | Stored; not handed to transport |
| claimed | Worker has a temporary claim; outcome not yet recorded |
| accepted | Gateway accepted the submission; no SMS sent confirmation yet |
| sent | Provider/Android reports SMS sent |
| delivered | Provider reports receipt; mock mode remains a simulation |
| failed | Definite failure; consult safe error code |
| expired | Unsent expiry reached |
| cancelled | Unsent recipient cancelled/blocked |
| unknown | Outcome cannot be confirmed; do not blindly resend |
| mixed | Multiple recipients have differing states |

The API never returns message text or ciphertext. Recipients are masked. An inaccessible message ID returns 404. A provider “Delivered” report is not a guarantee that a person read a message; consult the Android guide for multipart limitations. Ordinary status checks and usage requests count toward request limits.

## OTP flow

1. POST `/api/v1/otp/request` with `otp:request`, a stable Idempotency-Key and `{ "to": "+251912345678", "purpose": "login" }`.
2. Store `challengeId` and expiry associated with the intended login/account action. Codes are never returned, including in mock mode.
3. POST `/api/v1/otp/verify` with `otp:verify` and `{ "challengeId": "UUID", "purpose": "login", "code": "123456" }`.
4. Only `{ "verified": true }` authorizes your intended action; implement this check on your backend. A challenge is single use, purpose/application-bound, expiring and attempt-limited. Do not infer identity from a queued message or generate your own verification shortcut.

Defaults are five-minute expiry, one-minute resend cooldown and five guesses; recipient/IP/application/platform limits also apply. A superseded code cannot verify. The API does not link a phone number to an ERP account for you: your application must securely maintain that relationship and its own login session.

## Errors and retries

400 malformed input, 401 invalid/disabled/revoked credentials, 403 insufficient scope or policy restriction, 404 inaccessible resource, 409 conflicting request identity, 413 too large, 415 wrong message content type, 429 quota/request limit, 503 unavailable service/configuration. Do not log credentials, bodies or OTP codes. Back off on 429 and transient outages; retries of POST messages must reuse the original event ID and body. Inspect status before any replacement send after an unknown outcome. A GET failure does not mean the original POST failed.

Daily segments reset by Africa/Addis_Ababa calendar day; rate limits use fixed minute windows. Usage separates reserved and consumed segments. Unknown submission outcomes count conservatively. These are pilot controls, not a billing ledger.

## ERP integration example

See [server-side client](../examples/client.mjs) and [leave notification helper](../examples/erp-leave-notification.mjs). Imports perform no network activity. Configure private `ETHIOSMS_BASE_URL` and `ETHIOSMS_API_KEY` on the ERP server. After committing a leave decision, save an outbox event with a unique eventId, phone and decision. A worker calls notifyLeaveDecision, records the returned message ID and retries failures with the SAME persisted eventId. SMS failures should leave the notification pending rather than undo a committed HR decision. Never send payroll details, temporary passwords or internal HR notes in the SMS.

No existing ERP repository is modified. Contact consent, correct account/phone mapping, and actual delivery testing remain integration responsibilities.

## Workspace management

Cookie-authenticated management routes require `X-EthioSMS-Request: 1` for mutations and do not accept bearer keys as administrator sessions. Use the UI for invites, application approval, key rotation/revocation, quotas, campaigns and opt-outs. Key rotation revokes the old key immediately. Campaign approval is mandatory; automatic inbound STOP processing is not configured.

## Retention and old retries
Message content/history expires under the configured retention policy. Opaque request identities are retained separately so replay after cleanup returns **410 Gone** instead of generating a duplicate SMS. Start a genuinely new business event with a new ID; never replace an uncertain old event merely to bypass 410. Use opaque event IDs, not phone numbers, employee names or other sensitive data in Idempotency-Key. Expired OTP request metadata likewise cannot be reused to generate a new challenge under the old event ID.
