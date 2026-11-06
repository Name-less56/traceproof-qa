# Privacy policy

TraceProof is local-first. Docker stores cases, projects, replay receipts, hashed session tokens, and consented contact messages in a local PostgreSQL volume. Direct Node execution uses `data/traceproof.json` as a fallback. Contact messages are not sent externally. There are no analytics, advertising pixels, external fonts, or third-party browser SDKs.

The browser stores one optional preference, `traceproof_privacy_choice`, only after the user chooses **Understood** on the storage notice. Choosing **Do not save** dismisses the notice for the current page without writing that preference.

Use fictional or redacted values in QA cases. The bundled demo password is redacted from persisted DOM snapshots. Exported workspaces can contain case content and evidence; review them before sharing.

The necessary `tp_session` cookie is HttpOnly, SameSite=Strict, expires after eight hours, and gains `Secure` behind HTTPS. Only a SHA-256 hash of its random value is persisted.

To permanently delete Docker data, run `docker compose down -v`. For JSON fallback, stop the server and remove `data/traceproof.json`. Remove `traceproof_privacy_choice` from browser storage to reset the notice.
