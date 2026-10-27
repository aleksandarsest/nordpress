# Security

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's **Report a vulnerability** button on the repository's **Security** tab, which reaches the maintainers privately.

Include what's affected, how to reproduce it, and the impact you see. You'll get an acknowledgement, and a fix will be prioritized by severity. Credit is given in the release notes unless you'd rather stay anonymous.

## Supported versions

Security fixes go into the latest version on `main`. Keep your installation up to date (see **Upgrading** in [docs/production-checklist.md](docs/production-checklist.md)).

## How Nordpress protects sites

- Every action checks the signed-in person's capabilities on the server.
- All content (from the editor, the REST API, imports, Markdown and AI output) is parsed into the editor's schema before it's stored or shown, which drops scripts and unknown markup.
- Secrets (application passwords, OAuth tokens and codes) are stored only as SHA-256 hashes.
- Fetching URLs from content (imports, link checks) refuses private network addresses.
- Logins, comments, forms, orders and AI features are rate-limited.
- Payments go through Stripe Checkout; card details never reach the server.
