# Production checklist

## Must have

- [ ] **HTTPS** in front of the app (Caddy, nginx, or your host's load balancer). `SITE_URL` and `BETTER_AUTH_URL` use `https://`.
- [ ] **A strong `BETTER_AUTH_SECRET`** (`openssl rand -base64 32`), never reused between sites.
- [ ] **Backups** of the database (`pg_dump`, daily) and of uploads (the `uploads` volume or your S3 bucket). Try a restore once.
- [ ] **Backups:** turn on daily backups under **Tools → Backups** (add `/api/cron/backup` to your scheduler), and download one now and then to keep somewhere else. Try a restore on a staging copy once, so you know it works before you need it.
- [ ] **Two-step login or a passkey** for every administrator (**Profile → Security**). Set `SITE_URL` to the final domain first; passkeys are tied to it.
- [ ] **Email** (`SMTP_URL`, `MAIL_FROM`): password resets, form notifications, order emails and the newsletter need it. Without it, emails only go to the server log.
- [ ] **The reverse proxy sets `X-Forwarded-For`**: rate limits and comment flood protection rely on the visitor's address.

## Should have

- [ ] **`STORAGE_DRIVER=s3`** if the server has no persistent disk, or you run more than one instance.
- [ ] **`CRON_SECRET`** and a daily call to `/api/cron/site-checks`, so the Inbox checks run without anyone opening the dashboard.
- [ ] **Newsletter:** on serverless hosts, call `/api/cron/newsletter` every few minutes too, so scheduled posts are emailed and long sends finish. Add a postal address under **Newsletter → Settings**, and set up SPF, DKIM and DMARC for the sending domain with your email provider, or newsletters land in spam.
- [ ] **AI keys:** `ANTHROPIC_API_KEY` for the AI features, `VOYAGE_API_KEY` for semantic search and the site chat. Check usage and cost under **Settings → AI**.
- [ ] **Stripe** for the shop or paid memberships: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a webhook to `/api/shop/stripe` (events listed under **Shop → Settings** and **Members**).
- [ ] **Search engines:** under **Settings → Reading**, untick "Discourage search engines", decide on AI crawlers, and submit `/sitemap.xml`.

## Before opening the doors

- [ ] Sign in with an account that has only the role it needs; keep administrator accounts few.
- [ ] Decide whether agents may change the live site (**Settings → Agents**). The safe default is off.
- [ ] Turn on **Tell readers when AI helped write a post** (**Settings → AI**) if your audience expects it.
- [ ] Look through **Settings → Discussion** for comment moderation.

## Upgrading

run `install.sh` again (or `git pull && pnpm install && pnpm migrate && pnpm build` and restart). Migrations run before the new version starts. Read the commit log for anything marked as needing action.
