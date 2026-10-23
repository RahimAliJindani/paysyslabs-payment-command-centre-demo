# PaysysLabs Payment Command Centre — Premium UI v1.2

**Team-shareable GitHub package of the existing v1.2 demo.** Merchant terminal, customer checkout, analytics, Enterprise Admin, PayID/PayTo simulation, SQLite persistence and Talk to Data remain included.

> **SANDBOX ONLY:** No live NPP, PayID, PayTo, ISO 20022 certification, bank connection or real fund movement. Do not use actual customer information. The app includes synthetic provider confirmation and privileged demo controls.

## Quick start (Mac / Windows / Linux)

Install Node.js 24+, clone this repository and run:

```bash
npm test
npm start
```

Open http://localhost:4173/. Sign in at `/admin.html` with your reviewer email and the local demonstration code, then return to `/` for the merchant terminal; `/merchant.html` for analytics; `/admin.html` for Enterprise Admin. Local admin demo OTP is `786123` (never use as a production credential). Node.js built-in SQLite creates `./data` automatically. **Never commit `data/` or `.env`.**

## One-command Docker deployment (local)

```bash
docker compose up --build -d
docker compose logs -f
```

Open http://127.0.0.1:4173/. Data persists in the named Docker volume `paysyslabs_demo_data`. Stop with `docker compose down` (do **not** use `down -v` unless intentionally deleting data).

## Publish to GitHub

1. Create a **private** GitHub repository, e.g. `paysyslabs-payment-command-centre-demo`.
2. From this folder run:

```bash
git init
git add .
git commit -m "Prepare PaysysLabs Premium UI v1.2 team demo"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/paysyslabs-payment-command-centre-demo.git
git push -u origin main
```

Authenticate using GitHub CLI, Git Credential Manager or a personal access token when prompted. **Never paste tokens into source files.** GitHub Actions runs syntax checks, tests and a Docker build for each push and PR.

## Remote team demo (HTTPS, invite-only)

This application is **not suitable for anonymous public hosting**. Deploy its Docker container to a persistent-volume VM or container host, and terminate HTTPS at a reverse proxy (Caddy, nginx, or managed ingress). The included compose file binds to `127.0.0.1` only by default. Configure the reverse proxy to route `https://demo.your-domain.example` to `http://127.0.0.1:4173` on the same server.

Copy `.env.example` to `.env` and set:

```dotenv
PUBLIC_BASE_URL=https://demo.your-domain.example
PUBLIC_DEMO_MODE=1
DEMO_USERNAME=teamdemo
DEMO_PASSWORD=SET_A_LONG_RANDOM_PASSWORD_AT_LEAST_16_CHARACTERS
ALLOW_REMOTE_DEMO_OTP=1
ADMIN_DEMO_OTP=SET_A_PRIVATE_SIX_DIGIT_DEMO_CODE
ADMIN_REVIEWER_EMAILS=reviewer@example.com
SANDBOX_AUTO_CONFIRM=1
```

The application **refuses to start** in PUBLIC_DEMO_MODE without an HTTPS PUBLIC_BASE_URL and strong team gate password. All web pages, QR routes, and API endpoints require the HTTP Basic team gate. Browsers prompt for those credentials. The Enterprise Admin page additionally requires an explicitly configured six-digit demo code and an email in ADMIN_REVIEWER_EMAILS when PUBLIC_DEMO_MODE=1. **This is a temporary invitation-only sandbox gate, not production authentication.** A scanned QR may trigger a separate browser login prompt on the customer phone. Merchant APIs now require scoped merchant or admin sessions, provider simulation controls require admin access, and cross-origin writes are rejected. This remains a sandbox: replace demonstration admin login with real identity and bank-event verification before production use.

Never expose port 4173 directly to the Internet, never deploy without HTTPS, never store real PayIDs or financial records, and do not publish the repository or `.env` publicly. Put environment secrets in the hosting provider's secret manager where possible.

### Persistent data and backups

The database and locally generated AES key live together in `/app/data` inside the Docker volume. **Back up both**; losing the key can make encrypted records unreadable. Use a persistent disk on the hosting service. SQLite is appropriate for this low-concurrency sandbox; for scalable multi-instance deployment use a managed database and redesign event distribution. Never run two writable replicas against the same SQLite volume.

### QR codes on physical phones

Set PUBLIC_BASE_URL to the real HTTPS address; otherwise generated checkout QR links can point to localhost, which a phone cannot access. The merchant's vCard QR carries synthetic business contact details, while checkout QR links refer to sandbox payment sessions. They are not bank-issued PayTo QR payloads.

### Endpoints and access

- `/` — merchant iPad terminal
- `/customer-v11.html` — customer checkout (normally opened via the merchant flow)
- `/merchant.html` — merchant sales dashboard
- `/admin.html` — Enterprise Admin and Talk to Data
- `/api/health` — health response (behind team gate in PUBLIC_DEMO_MODE)

### Known limitations

- Demo OTP is fixed; remote use requires explicit opt-in behind the team gate. Replace with real email OTP/SSO before broad distribution.
- Local admin identity remains a fixed-code demonstration. Remote demo reviewers must be explicitly configured; this is not production SSO or OTP delivery.
- The public catalogue permits customers to start synthetic checkouts. Rate limits are per server process, and the remote team gate still covers checkout pages.
- CSV exports contain the full selected report. On-screen admin reports are paginated; merchant history shows the latest 100 attempts with complete aggregate totals.
- The app uses in-process SSE; a single server instance is required for consistent real-time updates.
- This package does not configure a hosting provider, DNS, TLS certificate, or live bank connectivity.

## Access and checkout flow

The Node server binds to `127.0.0.1` by default. Docker explicitly binds inside the container to `0.0.0.0`, while Compose exposes the port only on the host loopback interface. Set `PUBLIC_BASE_URL` to an HTTP(S) origin when another device must scan a QR; generated URLs never trust the incoming Host header. Environment variables must be provided by your shell or host; plain `npm start` does not load `.env` automatically.

For merchant-specific access, configure `MERCHANT_ACCOUNTS` as a JSON object keyed by catalogue merchant ID, with a username and unique password of at least 16 characters per merchant. Use the sign-in form at `/` or `/merchant.html`. No default merchant passwords are supplied. Admin demo sessions can operate all merchants; merchant sessions can read and create only their own transactions. Confirm/reject/reconcile simulation controls are available in the admin transaction register. Sessions use HttpOnly, SameSite cookies; remote demo cookies also require HTTPS.

On the terminal, select a purchase and choose **Create new checkout**. Its QR and link identify one payment, and the monitor follows that exact payment. The browser restores the selected checkout across reloads in the same tab. The permanent business vCard QR remains a contact card. `/checkout/:merchantId` and `/m/:merchantId` remain public sandbox storefront entry points and hand off to `/pay/:token`; they do not control a terminal's active checkout. Public checkout responses exclude internal transaction IDs, contact identifiers and event histories.

The persisted `provider_jobs` table records pending synthetic confirmations. The maintenance worker resumes processing after restart and expires idle pre-payment sessions. An unknown provider outcome remains unknown after checkout expiry until an admin resolves it. `SANDBOX_AUTO_CONFIRM=0` disables automatic synthetic confirmations; use admin controls to resolve them. New tables and indexes are created at startup without rewriting existing transaction records. Back up the database and encryption key before applying a new version to your own data.

Merchant and enterprise reporting use `Australia/Melbourne`, including daylight saving. All totals aggregate the full matching dataset in SQLite; report pagination never limits analytics source records. Supported question periods are today, yesterday, this month, last month and all time. Dates refer to payment creation time, not settlement or confirmation time.

## Verification

`npm test` runs the backend suite with temporary directories, isolated SQLite databases and temporary loopback servers; it never opens the project's `data/` database. It covers authorization boundaries, public checkout, QR, both payment rails, restart recovery, unknown outcomes, reporting beyond 500 rows, timezone boundaries, pagination and full exports.

`npm run test:browser` uses an already-installed Chrome or Chromium with a temporary browser profile and an isolated test server. Set `CHROME_BIN` if the executable is not in a standard location. Without an installed browser, this optional suite skips; it installs nothing. It exercises narrow-screen layouts, mobile navigation, exact terminal matching, checkout reloads and both payment rails. Temporary test processes are stopped when tests finish. No application service is left running.
