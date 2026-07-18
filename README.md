# chrishanfernando.com

Personal website — professional profile and projects. Built with [Astro](https://astro.build), deployed on Cloudflare Pages.

## Updating the site

All content lives in three JSON files — edit them (or ask Claude Code to), commit, and push. Cloudflare Pages rebuilds and deploys automatically in ~1 minute.

| File | What it controls |
| --- | --- |
| `src/data/profile.json` | Name, title, summary, about paragraphs, education, skills, contact links |
| `src/data/experience.json` | Career timeline (roles, companies, bullets, tags) |
| `src/data/projects.json` | Project cards (name, description, tags, GitHub link) |
| `public/resume.pdf` | The downloadable resume |

Design/layout changes go in `src/pages/index.astro` (structure) and `src/styles/global.css` (styling).

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # output in dist/
```

## Deployment

Pushing to `main` triggers a Cloudflare Pages build (`npm run build`, output dir `dist`). Domain and DNS are managed in Cloudflare.
