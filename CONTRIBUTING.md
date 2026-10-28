# Contributing to Nordpress

Thanks for helping. Bug reports, fixes, docs, plugins and themes are all welcome.

## Getting set up

Follow **Getting started** in the [README](README.md). You need Node 24, pnpm and PostgreSQL with pgvector.

Read [`AGENTS.md`](AGENTS.md) before changing code: it explains the layout and the rules every change follows (permissions, sanitizing content, caching). It's written for coding agents too, so Claude Code and similar tools pick it up automatically.

## Before opening a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI runs the same checks, plus the one-command installer on a clean server, with both databases.

- Keep changes focused: one fix or feature per pull request.
- Add tests for logic that can be tested without a database (see the `*.test.ts` files next to the code).
- Changing the database? Edit `src/db/schema.ts` and run `pnpm db:generate`; commit the migration.
- User-facing text is plain and specific: say what happened and what to do next.
- Security-sensitive changes (permissions, auth, anything rendering user content) need a short note in the pull request on how they stay safe.

## Reporting bugs

Use the bug report template. Please include steps to reproduce, what you expected and what happened. For security issues, see [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
