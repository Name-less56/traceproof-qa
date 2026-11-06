# Security policy

## Supported version

Security fixes are applied to the latest release line. This review build is version 2.0.x.

## Reporting

Report a suspected vulnerability privately to the repository owner. Do not include secrets, personal data, or exploit payloads that affect systems outside the local demo.

## Current controls

- Loopback binding by default.
- Same-origin checks on API writes.
- Fetch Metadata rejection for cross-site mutations.
- JSON content-type enforcement and a 150 KB body limit.
- Scrypt password verification, timing-safe comparison, login throttling, 256-bit sessions, persisted token hashes, HttpOnly/SameSite cookies, and admin roles.
- Parameterized PostgreSQL queries, transactions, and an advisory write lock.
- Allowlisted sandbox routes, actions, and `data-testid` selector syntax.
- Atomic local file writes with owner-only file permissions.
- Restrictive CSP for the main application and isolated CSP exceptions for the bundled sandbox fixtures.
- Security, referrer, framing, browser-permission, and MIME-sniffing headers.
- No third-party runtime SDKs, tracking, or remote fonts.
- Non-root, read-only application container with dropped Linux capabilities and `no-new-privileges`.

## Production limitations

Fixed demo users are not production identity: there is no reset flow, MFA, SSO, tenant isolation, or distributed rate-limit store. There is no isolated server-side browser worker, encrypted evidence store, signed audit identity, or retention scheduler. Keep the stack on loopback and do not expose it directly to the public internet.
