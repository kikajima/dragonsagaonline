# Cloudflare Workers migration

This branch prepares Dragon Saga Online for migration from Vercel to Cloudflare Workers while keeping the current production stack untouched.

## Target architecture

- Cloudflare Workers: Next.js frontend
- Railway: Colyseus multiplayer server
- Supabase: authentication and persistent game data

## Current deployment path

Cloudflare automatic configuration selected the OpenNext Cloudflare adapter for this existing Next.js application. The first build compiled successfully, but the generated self-reference service binding used the generic package name `nextjs-tailwind-shadcn-ts` instead of the Cloudflare Worker name `dragonsagaonline`.

This branch now includes an explicit `wrangler.jsonc` where both the Worker name and `WORKER_SELF_REFERENCE` target are `dragonsagaonline`.

Wrangler runs the OpenNext build automatically through the custom build command before deployment.

## Checks

The GitHub Actions workflow verifies:

1. existing dependencies with the frozen Bun lockfile;
2. the current Next.js production build;
3. the Cloudflare OpenNext build.

## Cloudflare project settings

Use:

- Project name: `dragonsagaonline`
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`
- Repository path: `/`

The build command in the Cloudflare dashboard may remain empty because the Wrangler configuration now owns the OpenNext build step.

For migration testing, use the `cloudflare-migration` branch before switching production to `main`.

## Runtime/build variables

Configure these values in the Cloudflare project before the final production cutover:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_COLYSEUS_URL`

The Colyseus URL remains on Railway during this migration.

## Production cutover

Do not point the production domain at Cloudflare until the Workers preview is validated for authentication, character loading, multiplayer connection, PvE/PvP, mobile controls and static assets.

Branch-control verification trigger: Cloudflare production branch is `cloudflare-migration`.
