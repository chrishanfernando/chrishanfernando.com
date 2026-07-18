# chrishanfernando.com

Chrishan's personal website: professional profile + projects. Astro static site, deployed via Cloudflare Pages on push to `main`. Custom domain `chrishanfernando.com` (registrar + DNS: Cloudflare).

## Content updates (the common task)

Content is data-driven — for "update my site" requests, edit JSON only:

- `src/data/profile.json` — identity, summary, about, education, skills, contact links
- `src/data/experience.json` — career timeline
- `src/data/projects.json` — project cards
- `public/resume.pdf` — downloadable resume (SysEng version, **phone number stripped**; source of truth is `/Users/chrishanfernando/Desktop/jobs/Resume_Generic_SysEng.docx`, regenerate via LibreOffice: `/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf`)

After editing: `npm run build` to verify, then commit and push to `main` — Cloudflare deploys automatically. Verify at https://chrishanfernando.com after ~1 minute.

## Conventions

- Never publish Chrishan's phone number anywhere on the site or in the resume PDF.
- Public contact email is `hello@chrishanfernando.com` (Cloudflare Email Routing → Gmail), not his Gmail addresses.
- Positioning is engineering-led: Senior Systems Engineer in clinical AI / regulated MedTech first; product experience is supporting depth.
- Design: dark theme (`#0b0e14`), teal accent (`#2dd4bf`), monospace accents. Keep it restrained — no heavy animation.
- No frameworks/libraries beyond Astro; no external fonts or CDNs (fast + private).
