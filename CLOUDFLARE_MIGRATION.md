# Cloudflare Workers migration

This branch prepares Dragon Saga Online for migration from Vercel to Cloudflare Workers while keeping the current production stack untouched.

## Target architecture

- Cloudflare Workers: Next.js frontend
- Railway: Colyseus multiplayer server
- Supabase: authentication and persistent game data

## Why this branch does not commit generated vinext files yet

Cloudflare currently recommends vinext for Next.js on Workers. Wrangler can automatically detect an existing Next.js project, install the required adapter, and generate the Worker configuration. The generated setup should be created from the Cloudflare-connected repository so that the Cloudflare account and build settings match the project.

The repository uses Bun, so the migration keeps `bun.lock` unchanged until the generated Cloudflare configuration is created by the official setup flow.

## Checks available now

Run:

```bash
bun run cloudflare:check
```

The branch also contains a GitHub Actions workflow that runs the vinext compatibility scanner and the existing Next.js build.

## Cloudflare connection step

When the compatibility workflow is green:

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Choose Create / Import a repository.
4. Connect GitHub if prompted.
5. Select `kikajima/dragonsagaonline`.
6. Select the `cloudflare-migration` branch for the first deployment.
7. Use `npx wrangler deploy` as the deploy command if Cloudflare asks for one.
8. Let Wrangler perform automatic Next.js configuration.

Do not point the production domain at Cloudflare until the preview deployment has been tested.

## Runtime variables

Keep these values configured in the Cloudflare project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_COLYSEUS_URL`

The Colyseus URL remains on Railway during this migration.
