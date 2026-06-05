# Engineer Briefing — `/analysis` Blog Route + Authoring System

**Filed:** 2026-05-20 evening, for overnight build
**Status:** Open, ready to execute
**Target deploy:** Tomorrow morning (2026-05-21) — reviewed + first post live

---

## What you're building

A new editorial section on `hockeygamebot.com` for long-form analytical articles. Currently the site is a stats product (`/stats/*`, `/teams/*`, `/games/*`). This adds an editorial layer — articles that link back to the stats pages with embedded data and analysis.

Single author (Matt), markdown-based authoring, git-deployed via Cloudflare Pages.

## Scope (v1)

### Required

1. **`/analysis` index page** — lists all published articles in reverse chronological order
   - Card per article: title, publish date, description (from frontmatter), tags, optional thumbnail/OG image
   - Empty state if no articles yet
   - Pagination if >20 articles (defer if you want — start with no pagination, full list)

2. **`/analysis/{slug}` article pages** — individual article render
   - Markdown content rendered with Astro's built-in MDX or markdown support
   - Frontmatter-driven metadata: title, date, description, tags, og_image
   - Reading-time estimate (auto-computed from word count, library or simple regex)
   - Date published prominently displayed
   - Author byline: "By Matt Donders" with link to personal Twitter / Bluesky / Threads handles
   - "Back to /analysis" link
   - Footer with "Read more analysis →" link to index

3. **Article authoring system documentation** — clear instructions on how to publish a new post
   - Where to create the file: `hockeygamebot-site/src/content/analysis/{YYYY-MM-DD-slug}.md`
   - Frontmatter template (see below)
   - Body markdown conventions (image embedding, internal linking, etc.)
   - Git workflow: `git add . && git commit -m "Publish analysis: {title}" && git push`
   - CF Pages auto-builds on push (no manual deploy)
   - Document at `hockeygamebot-site/src/content/analysis/_README.md`

4. **OG image strategy** — every article needs a tweet-shareable preview image
   - Option A (preferred): frontmatter `og_image` field accepts a path or URL; the article page uses that for OG metatags
   - Option B (fallback): auto-generate from article title using the existing card generator pattern — only build if (A) doesn't take 30 min

5. **Nav integration** — add "Analysis" to the main site nav (alongside Stats, Teams, etc.)

6. **First seed post** — drop a placeholder article so the route isn't empty when it ships:
   - Filename: `2026-05-21-conference-finals-preview.md`
   - Title: "2026 Conference Finals Preview"
   - Status: published
   - Body: 2-3 paragraphs combining the COL/VGK and CAR/MTL preview threads (use the staged thread files at `hgb-scripts/social/threads/2026-05-2{0,1}_*.txt` as source material — just paste + lightly format into prose, don't rewrite)
   - Tags: ["playoffs", "preview", "western-conference", "eastern-conference"]
   - OG image: use one of the existing prediction card PNGs at `hgb-scripts/social/images/2026-05-2{0,1}_*-prediction.png`

### Frontmatter template (document this in `_README.md`)

```yaml
---
title: "2026 Conference Finals Preview"
description: "What the HGB model sees for COL/VGK and CAR/MTL"
date: "2026-05-21"
tags: ["playoffs", "preview"]
og_image: "/og/2026-conf-finals-preview.png"
status: "published"  # or "draft" — drafts don't render on /analysis index
author: "Matt Donders"
---
```

### Markdown conventions to document

- Internal links to stats pages: `[CAR's playoff lines](/stats/lines?game_type=3&team=CAR)`
- Image embeds: `![alt text](/images/path.png)` — images go in `public/images/analysis/{slug}/...`
- Pull quotes / callouts: use a standard markdown blockquote `>`
- Code/data tables: native markdown tables OK; complex tables use HTML
- Embedded HGB cards: reference image paths same as regular images

## Out of scope (do NOT build)

- Comments / disqus / etc. — no.
- Search across articles — defer until article count justifies it (>10 articles).
- Newsletter signup widget — explicit cut per content calendar.
- Multi-author UX — single author only.
- Custom CMS, admin UI, auth-based posting — markdown + git IS the auth.
- RSS feed — defer to v1.1.
- Tag-filtered index pages (`/analysis/tag/playoffs`) — defer to v1.1.
- Article reactions / likes / share counts — defer indefinitely.
- Cross-posting articles to Bluesky/X automatically — manual posting from Matt's accounts.

## Design language

Match the existing site design language exactly:
- Barlow Condensed for article titles + section headers
- Body type: whatever the site currently uses for body copy (probably a clean sans-serif — match what's already there)
- Cream/ink palette
- Article max-width: 720px or so for readability (no full-width body text)
- Code blocks / blockquotes: styled per existing design tokens
- Internal links: same red accent as the rest of the site

## File structure (proposed)

```
hockeygamebot-site/
└── src/
    ├── content/
    │   └── analysis/
    │       ├── _README.md          ← authoring docs
    │       ├── _config.ts          ← content collection schema
    │       └── 2026-05-21-conference-finals-preview.md  ← seed post
    ├── pages/
    │   └── analysis/
    │       ├── index.astro          ← /analysis index page
    │       └── [slug].astro         ← article page template
    └── public/
        └── og/
            └── 2026-conf-finals-preview.png  ← seed OG image (copy from hgb-scripts/social/images/)
```

## Acceptance criteria

- [ ] `/analysis` index page loads, shows seed post in card layout
- [ ] `/analysis/2026-05-21-conference-finals-preview` loads, renders markdown body cleanly
- [ ] Article page has working OG metatags (verify by pasting URL into a Twitter/Bluesky compose box and seeing the card preview)
- [ ] Nav "Analysis" link works from any page
- [ ] `_README.md` documents the full authoring workflow including frontmatter template
- [ ] Drafts (status: "draft" in frontmatter) don't appear on the /analysis index
- [ ] Mobile rendering works (article body readable on phone width)
- [ ] Light AND dark mode both render cleanly
- [ ] Author byline links to Matt's social handles correctly (X: @mattdonders, Bluesky: @mattdonders.com, Threads: @mattdonders)
- [ ] Reading-time estimate displays on article page

## Time budget

~3-5 hours overnight. Astro content collections are well-documented; this is well within scope.

## Reporting back

When done, post:

1. Live URL to the /analysis index
2. Live URL to the seed article
3. Path to `_README.md` so Matt can follow the authoring workflow tomorrow
4. Any architectural choices made that diverge from this brief (e.g., if you used Astro Content Collections vs raw markdown imports, document why)
5. Any blockers / questions for Matt to resolve in the morning

## Tomorrow morning expectations

Matt will:
1. Review the /analysis route + seed post
2. Either refine the Conference Finals preview content OR write a fresh post
3. Validate the authoring workflow by creating + publishing a second article himself
4. Provide feedback for v1.1 iteration

## What's NOT to confuse this with

- This is NOT the iOS app work (different engineer queue, different scope)
- This is NOT the anomaly detector or stats infrastructure (separate concerns)
- This IS the editorial layer that lives on top of the existing stats site

## Critical timing note

If the seed post renders correctly and the authoring system works, Matt will start backfilling articles tomorrow during his content cycle. Don't ship if any of the acceptance criteria fail — better to surface the issue and let Matt review than to launch with a broken /analysis route.

Don't over-engineer. The simplest version that satisfies the acceptance criteria ships. Save the v1.1 polish for after Matt has used the system for a few posts and identified real friction.
