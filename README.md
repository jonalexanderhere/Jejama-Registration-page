# JEJAMA CTF

Run `node worker/build.mjs` from this directory to generate the Sites Worker at `dist/server/index.js`. The Worker serves the assets in `dist` and handles registrations. Deploy it with the bindings in the hosting manifest and the SQL migration in `drizzle`.

- `DB` stores registrations and review status.
- `BUCKET` stores private payment proofs.
- `ADMIN_EMAILS` is the comma-separated list of authorized ChatGPT account emails. Set it in the Sites runtime environment.

Organizers sign in to `/admin` to download proofs and review submissions. The legacy Python server and its SQLite records are separate from the hosted registration system.

## Vercel

The Vercel project builds from `main` with `npm run build`. The production environment needs a Neon `DATABASE_URL` (or `POSTGRES_URL`), a private Blob store linked as `BLOB_READ_WRITE_TOKEN`, and `JEJAMA_ADMIN_EMAIL` plus `JEJAMA_ADMIN_PASSWORD` set as sensitive values. Redeploy after configuring them.

Payment proofs upload directly to private Blob to support the 5 MB form limit. The registration endpoint validates the file before saving the team in Postgres. Organizers sign in at `/admin` using the configured credentials. Cloudflare Sites registrations and files are stored separately.

Verification email on Vercel requires Production variables: `RESEND_API_KEY` (sensitive), `JEJAMA_EMAIL_FROM` (an address on a verified Resend domain), `JEJAMA_TWIBBON_URL`, and `JEJAMA_GROUP_URL` (sensitive if private). Redeploy after setting them.
