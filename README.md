# JEJAMA CTF

Run `node worker/build.mjs` from this directory to generate the Sites Worker at `dist/server/index.js`. The Worker serves the assets in `dist` and handles registrations. Deploy it with the bindings in the hosting manifest and the SQL migration in `drizzle`.

- `DB` stores registrations and review status.
- `BUCKET` stores private payment proofs.
- `ADMIN_EMAILS` is the comma-separated list of authorized ChatGPT account emails. Set it in the Sites runtime environment.

Organizers sign in to `/admin` to download proofs and review submissions. The legacy Python server and its SQLite records are separate from the hosted registration system.
