# chrishanfernando.com

Chrishan's personal website: professional profile + projects. Astro static site, deployed as a Cloudflare **Worker** (static assets via `wrangler.jsonc`) on push to `main`. Worker name: `professionalprofile` (preview URL: professionalprofile.chriz999.workers.dev). Custom domains `chrishanfernando.com` + `www` (registrar + DNS: Cloudflare). Email Routing forwards hello@chrishanfernando.com to Gmail.

## Content updates (the common task)

Content is data-driven — for "update my site" requests, edit JSON only:

- `src/data/profile.json` — identity, summary, about, education, skills, contact links
- `src/data/experience.json` — career timeline
- `src/data/projects.json` — project cards
- `public/resume.pdf` — downloadable resume (SysEng version, **phone number stripped**; source of truth is `/Users/chrishanfernando/Desktop/jobs/Resume_Generic_SysEng.docx`, regenerate via LibreOffice: `/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf`)

After editing: `npm run build` to verify. **Never commit to `main` directly** — use the PR flow (below). Merging to `main` triggers the production deploy: Cloudflare Workers Builds runs `npm run build` + `npx wrangler deploy` automatically. Verify at https://chrishanfernando.com after ~1 minute (if sandbox DNS won't resolve, pin the IP: `curl --resolve chrishanfernando.com:443:104.21.58.103 ...` or fetch the workers.dev URL).

## Deploy workflow (PR flow is the default)

Production deploys on **push/merge to `main`**, so `main` is protected by convention — every change goes through a PR:

1. Branch off `main`: `git checkout -b <topic>` (e.g. `content/update-projects`).
2. Commit there, `npm run build` to verify, push the branch.
3. Open a PR with `gh pr create` and let Chrishan review + merge. Do **not** self-merge unless he explicitly says to.
4. On merge, Cloudflare builds `main` and deploys to production.

Cloudflare Workers Builds is set to also build **non-production branches** and publish a **preview URL** (a versioned `*.professionalprofile.chriz999.workers.dev` alias) so changes can be eyeballed before merge — the preview link shows up on the PR / in the Cloudflare dashboard's build log.

## Conventions

- Never publish Chrishan's phone number anywhere on the site or in the resume PDF.
- Public contact email is `hello@chrishanfernando.com` (Cloudflare Email Routing → Gmail), not his Gmail addresses.
- Positioning is engineering-led: Senior Systems Engineer in clinical AI / regulated MedTech first; product experience is supporting depth.
- Design: dark theme (`#0b0e14`), teal accent (`#2dd4bf`), monospace accents. Keep it restrained — no heavy animation.
- No frameworks/libraries beyond Astro; no external fonts or CDNs (fast + private).
