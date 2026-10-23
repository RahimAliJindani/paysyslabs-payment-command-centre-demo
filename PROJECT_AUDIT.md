# Payment Command Centre v1.2: audit and implementation checkpoint

## Initial audit

The project uses plain browser HTML/CSS/JavaScript, a Node.js HTTP server, built-in SQLite with WAL persistence, and vendored QR generation. PayID, PayTo, provider confirmation, and settlement are simulations. Enterprise analytics are deterministic rather than an external LLM integration.

The initial checkout was on `main` with a clean working tree and the expected GitHub remote. Node.js v24.14.1 was available. All 15 original application/test JavaScript files passed syntax checks. The application was not listening on port 4173. Automated tests were initially withheld because the audit prohibited file writes and temporary server processes.

The five approved implementation priorities were:

1. Add merchant authorization, restrict operator/provider controls, and default to loopback binding.
2. Track a specific checkout and recover customer journeys after refresh or QR scan.
3. Persist synthetic confirmation work and preserve unknown provider outcomes through expiry.
4. Aggregate complete datasets, apply requested reporting periods, and use consistent business dates.
5. Repair mobile navigation and improve accessibility, layout, and connection feedback.

## Completed implementation

- Merchant accounts have scoped sessions; admin sessions can operate all merchants. Reports, transaction reads, and live event streams enforce merchant scope. Payment confirmation, rejection, and reconciliation require admin access.
- Public storefront creation accepts catalogue selections, while token-scoped responses exclude internal transaction IDs, identifiers, and histories. Cross-origin writes are rejected. Checkout creation and live connections have limits.
- Local startup binds to loopback. Docker listens inside its container while Compose exposes only the host loopback port. Generated checkout URLs do not trust request Host headers. Health responses omit filesystem paths.
- Terminals create and restore a specific checkout. Historical successes do not automatically become the current purchase. QR and storefront journeys use a shared recoverable checkout.
- SQLite provider jobs survive restart. Pre-payment sessions expire through maintenance. Unknown outcomes remain unresolved until an operator acts. State/event writes are atomic, and notifications follow commit.
- SQL aggregates cover the full dataset. Reports use Australia/Melbourne business dates, including daylight saving. Supported question periods include today, yesterday, this month, last month, and all time. Admin reports are paginated; CSV exports cover the full report.
- Mobile navigation remains accessible, connection feedback reflects connectivity, sign-in appears within the page layout, controls have accessibility improvements, and external font imports were replaced with system fonts.
- README and environment examples document setup, access, checkout recovery, and verification.

## Verification at this checkpoint

- `npm test`: eight backend tests passed.
- `npm run test:browser`: one real Chrome browser test passed, covering mobile navigation, terminal matching and reloads, scoped merchant login, admin reconciliation, storefront handoff, and both payment rails.
- Syntax checks: all 24 application/test JavaScript files passed.
- `git diff --check`: passed.
- Existing local data-file fingerprints matched before and after final validation. Tests used isolated temporary databases and browser profiles.
- No dependencies were installed. No application service was left running on port 4173. Existing transaction records were not changed during implementation.

## Remaining limits

This remains a synthetic sandbox, not a live payment system. Admin login remains demonstration authentication rather than production SSO or emailed OTP. Remote demo reviewers require explicit configuration. Infrastructure integrations and TID/MDR support remain placeholders. SQLite, event distribution, and limits assume one server instance. Dates refer to transaction creation time. Browser validation used installed Chrome; other browser engines were not verified.

Existing databases receive additive schema/index setup when the updated application is next started; startup and normal payment maintenance can then update payment lifecycle records. The user's existing database was not opened by the implementation tests. Runtime data, encryption keys, and private environment files remain excluded from Git.
