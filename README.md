# hockeygamebot-site

Astro static site for HockeyGameBot, deployed via Cloudflare Pages at hockeygamebot.com.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev      # Local dev server
npm run build    # Build for production
npm run preview  # Preview production build locally
```

Deploy: push to `main` branch → Cloudflare Pages auto-deploys. The `rewrite` branch deploys to `rewrite.hockeygamebot-site.pages.dev`.

## Documentation

Full documentation at [hgb-docs](../hgb-docs/) — see [CLAUDE.md](../CLAUDE.md) for page structure, design system, and editorial conventions.
