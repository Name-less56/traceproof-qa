# Changelog

## 2.2.0 — 2026-11-07

### Added
- Server-side Playwright runner (`POST /api/runs/playwright`, `GET /api/runner`, `GET /api/artifacts/:id/trace.zip|screenshot.png`): isolated headless Chromium, sandbox-only network, real trace.zip and screenshot.
- Auto-hiding top bar with collapse-to-neon-line and glitch reveal, NAV dock, top-edge hover reveal.
- Cyberpunk SVG icon set, full-width search, new chamfered "trace" logo mark, favicon, logo and banner; "Developed by: Seth Castañeda" under the wordmark.
- Globe run pulses, last-signal HUD, location panel beside the copy (controls moved off the sphere).
- `render.yaml` Render Blueprint, `TRUST_PROXY` support, `npm run screenshots` with real README captures.
- Self-hosted Chakra Petch display face (SIL OFL, `public/fonts/`) for headings, navigation, controls and brand.
- Command palette (⌘K / Ctrl K) and global keyboard shortcuts.
- Liquid-indicator top navigation with a "More" menu, scroll progress and a top drop-down sheet on small screens.
- WebGL globe renderer (atmosphere, graticule, scan sweep, hub arcs, inertia drag, keyboard control) with Canvas 2D fallback.
- Time-zone based city detection (offline, 80 cities) and haversine nearest-city matching for consented geolocation.
- Replay speed control, progress bar and in-sandbox element highlighting.
- Runs filters, search, clickable rows, median duration and pass-rate sparkline; overview feed and quick replay.

### Changed
- Rewrote `styles.css` as one design system (previously three overlapping layers) with WCAG-checked text colors and minimum 11px UI text.
- Storage labels now reflect the real backend (PostgreSQL or JSON file) instead of always claiming PostgreSQL.
- Run duration now records only action time, excluding the visual replay delay.

### Fixed
- Top bar flicker: removed the height change on scroll (it shifted layout under the scroll position), added direction hysteresis, stopped focus from pinning the bar after a click, and replaced the per-item glitch with a single GPU-only fade. The bar now fades out after ~12px of downward scroll.
- Globe rotates in every direction with mouse/pen; touch gestures that start vertically still scroll the page.
- Globe drag no longer follows the pointer or blocks scrolling: hover parallax removed, rotation only starts on horizontal intent, and the grab is released on pointer loss or window blur.
- Platform trend bars rendered empty: inline `style` attributes were blocked by the CSP.
- Navigation overflowed at common laptop widths.

## 2.1.0 — 2026-11-06

- Rebuilt the hero as a real-geography, 73k-particle Earth with cursor parallax, city highlighting, offline nearest-city resolution, and consent-based browser geolocation.
- Added a persistent Platform control plane covering Playwright worker manifests, trace.zip indexing, assisted test authoring, integrations, identity policy, signed audit state, scheduled agents, notifications, trends, browser/region matrices, SDK keys, and deployment posture.
- Added local SDK documentation, release-readiness trends, SHA-256-only API-key storage, and explicit simulation labels for credential-dependent providers.

## 2.0.0 — 2026-11-06

### Added

- PostgreSQL 16 persistence and a hardened Docker Compose stack.
- Demo sessions, roles, login throttling, project management, team, contact, and health APIs.
- Eight application views and a pointer-reactive particle Earth.
- Consent workflow and updated cookie, SDK, privacy, terms, security, and audit documentation.

### Changed

- Rebuilt the interface with higher-contrast cyan, green, white, violet, and near-black cyberpunk styling.
- Accelerated transitions and upgraded the responsive top navigation.

## 1.2.0 — 2026-11-06

### Added

- Four application views: Overview, Workbench, Activity, and Governance.
- Interactive signal field that morphs and shifts with pointer movement.
- Animated top navigation that hides while scrolling down and returns while scrolling up.
- Expanded workflow and trust-center sections.
- Visible “Developed by: Seth Castañeda” attribution.

### Changed

- Rebalanced typography, spacing, panel density, and dashboard hierarchy.
- Replaced the muted black palette with a deeper midnight, cyan, violet, and steel system.

## 1.1.0 — 2026-11-06

### Added

- Vesper-inspired local-first visual system with mint and violet signal artwork.
- Case sorting and complete severity filtering.
- In-product privacy, terms, security, and storage inventory views.
- Equal-choice local-storage notice and keyboard focus containment for dialogs.
- Same-origin write protection, JSON media-type enforcement, hardened headers, and stricter CSP.
- Project governance documents, CI workflow, environment example, and audit report.

### Changed

- Removed remote font loading and all runtime third-party requests.
- Improved responsive behavior, focus visibility, reduced-motion support, and empty states.

## 1.0.0 — 2026-11-06

- Initial local QA reproduction workspace.
