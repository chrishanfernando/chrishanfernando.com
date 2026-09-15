# Private meal-plan page — setup

A password-gated meal-planning page shared between two people, at an unguessable URL
`https://chrishanfernando.com/m/<slug>`. It is **not linked anywhere** on the site and is
excluded from the sitemap and search engines. Edits are stored server-side (Cloudflare KV)
so both devices see the same plan; each device also polls every 5s to pick up the other's
changes live.

## How it works

- `worker/index.js` — the Cloudflare Worker. Anything not under `/m/` is passed straight to
  the static Astro site. Under `/m/<slug>` it does the password gate + state API.
- `worker/meal-plan-page.js` — the login page and the interactive rotation page (design copied
  from the original artifact; persistence rewritten to use the API).
- State lives in one KV key (`state`) as a single JSON document.

Nothing private is in the repo: the URL slug, the password, and the cookie-signing key are all
Worker **secrets**.

## One-time setup (do this before the first production deploy)

All commands run from the repo root. You'll need to be logged in: `npx wrangler login`.

1. **Create the KV namespace** and copy the returned `id` into `wrangler.jsonc`
   (replace `REPLACE_WITH_KV_NAMESPACE_ID`):

   ```
   npx wrangler kv namespace create MEAL_KV
   ```

2. **Set the three secrets** (you'll be prompted to paste each value):

   ```
   npx wrangler secret put MEAL_SLUG          # e.g. run: openssl rand -hex 8
   npx wrangler secret put MEAL_PASSWORD      # the shared password you and your wife use
   npx wrangler secret put MEAL_COOKIE_SECRET # e.g. run: openssl rand -hex 32
   ```

   > Note: if the site deploys via **Cloudflare Workers Builds** (git push), set these secrets
   > in the Cloudflare dashboard under the Worker's *Settings → Variables and Secrets* as well,
   > or run the `wrangler secret put` commands once against the deployed Worker — CI deploys don't
   > read your local machine.

3. **Your private URL is** `https://chrishanfernando.com/m/<MEAL_SLUG>` — bookmark it on both
   phones. Share the password out-of-band (not over the same channel as the URL).

## Local development

```
cp .dev.vars.example .dev.vars   # fill in any local values
npm run build                    # build the static site into ./dist
npx wrangler dev                 # serve worker + assets at http://localhost:8787
```

Then open `http://localhost:8787/m/<your-local-MEAL_SLUG>`.

## Changing the URL or password later

Just re-run the relevant `wrangler secret put` command. Changing `MEAL_COOKIE_SECRET` logs
both of you out (you'll re-enter the password). Changing `MEAL_SLUG` changes the URL.
