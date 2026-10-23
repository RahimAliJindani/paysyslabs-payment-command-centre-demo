# PaysysLabs Payment Command Centre — Premium UI v1.2

**Team-shareable GitHub package of the existing v1.2 demo.** Merchant terminal, customer checkout, analytics, Enterprise Admin, PayID/PayTo simulation, SQLite persistence and Talk to Data remain included.

> **SANDBOX ONLY:** No live NPP, PayID, PayTo, ISO 20022 certification, bank connection or real fund movement. Do not use actual customer information. The app includes synthetic provider confirmation and privileged demo controls.

## Quick start (Mac / Windows / Linux)

Install Node.js 24+, clone this repository and run:

```bash
npm test
npm start
```

Open http://127.0.0.1:4173/ for the merchant terminal; `/merchant.html` for analytics; `/admin.html` for Enterprise Admin. Local admin demo OTP is `786123` (never use as a production credential). Node.js built-in SQLite creates `./data` automatically. **Never commit `data/` or `.env`.**

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
ADMIN_DEMO_OTP=786123
SANDBOX_AUTO_CONFIRM=1
```

The application **refuses to start** in PUBLIC_DEMO_MODE without an HTTPS PUBLIC_BASE_URL and strong team gate password. All web pages, QR routes, and API endpoints require the HTTP Basic team gate. Browsers prompt for those credentials. The Enterprise Admin page additionally uses its demonstration email/code flow. **This is a temporary invitation-only sandbox gate, not production authentication.** A scanned QR may trigger a separate browser login prompt on the customer phone. For a frictionless public buyer experience, implement real identity, roles, CSRF protection, payment-event authorisation, and a safe public checkout boundary before deployment.

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
- Simulation endpoints and merchant reports lack per-merchant RBAC. The team gate protects the entire demo, not individual buyers from each other.
- The app uses in-process SSE; a single server instance is required for consistent real-time updates.
- This package does not configure a hosting provider, DNS, TLS certificate, or live bank connectivity.
