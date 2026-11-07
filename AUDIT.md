# Product, UX, privacy, and technical audit

Audit date: 2026-11-06

## Critical

No critical issue remained after the review. The application is intentionally loopback-only and contains no production credentials or external service integration.

## Important findings addressed in 2.0

- Remote Google Fonts request removed to eliminate an unnecessary third-party disclosure.
- Main-page CSP tightened; security, permission, referrer, framing, and MIME headers added.
- Cross-origin API mutations rejected and JSON writes require the correct media type.
- Legal/privacy information and a complete storage inventory added in-product and as repository documents.
- Modal focus containment, visible focus, reduced-motion behavior, mobile layout, low-severity filtering, and sorting improved.
- Inline presentation styles removed from dynamically rendered application content.
- Personal attribution from sample documentation removed; fixtures remain fictional.
- PostgreSQL persistence, schema bootstrap, transactional synchronization, health reporting, and Docker orchestration added.
- Demo sessions, token hashing, role enforcement, throttling, and consented local contact storage added.
- The application image now runs non-root with a read-only filesystem, dropped capabilities, health checks, and no privilege escalation.

## Accepted demo limitations

- Docker uses PostgreSQL; JSON remains a deliberate fallback for offline development and isolated tests.
- The replay engine runs in a same-origin iframe and is not an isolated Playwright worker.
- Demo login is included, but fixed portfolio identities are not production lifecycle, MFA/SSO, or tenant boundaries.
- Historical runs remain after a case is deleted to preserve evidence continuity; a production retention policy needs an explicit product decision.
- Accessibility was reviewed through semantic markup, keyboard behavior, focus styles, responsive browser checks, and reduced-motion CSS. A formal external WCAG certification was not performed.

## Production infrastructure required

- Versioned migrations, encrypted backups, tenant/project ownership, and retention jobs.
- Production identity provider, MFA/SSO, CSRF tokens, recovery flows, and a distributed rate limiter.
- Isolated Playwright workers with timeouts, network allowlists, artifact redaction, and malware scanning.
- Object storage for traces/screenshots, secret management, observability, rate limits, and incident response.
- CI provider and repository connection for real pull requests and releases.

## UI / front-end audit — 2.2 (2026-11-07)

Fixed:
- Three stacked CSS layers overrode each other (base, "cyberpunk control layer", "planetary v2.1"); replaced by one token-based design system.
- Body/label text used colors down to ~3.2:1 contrast at 7–9px; text tokens now start at 4.9:1 and UI text at 11px+.
- Navigation overflowed and truncated tabs at 1280–1440px; replaced with 5 primary tabs + "More" menu and a top sheet below 1180px.
- Trend chart bars used inline `style` attributes, which the app CSP (`style-src 'self'`) silently blocked.
- UI copy claimed PostgreSQL even when the JSON fallback was active.
- Recorded run duration included cosmetic delays.
- Globe: 2D canvas redrew ~36k points per frame on the CPU; now rendered on the GPU (WebGL) with a 2D fallback, paused off-screen and in hidden tabs.

Known / not changed:
- Case creation and replay do not require a session, while the permission matrix says viewers cannot create cases.
- Platform modules (workers, SSO, AES evidence storage, notifications) are simulation adapters; the UI now labels them as such.
- Assisted authoring is keyword-based, not an LLM.
