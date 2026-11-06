# Contributing

1. Use Node.js 20 or newer.
2. Create a focused branch such as `feature/case-filtering`.
3. Keep fixtures fictional and never commit `.env`, logs, local data, tokens, cookies, or database files.
4. Run `npm run check` before opening a pull request.
5. Use conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
6. Describe user impact, security/privacy impact, and verification in the pull request.

Pull requests should target `develop`. Release pull requests promote `develop` to `main` after CI passes. This repository package does not fabricate branch or commit history; create those branches only when a real remote workflow is authorized.
