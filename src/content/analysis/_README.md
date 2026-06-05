# Analysis Authoring Guide

How to publish a new article on `/analysis`.

---

## Quick start

1. Create `src/content/analysis/YYYY-MM-DD-your-slug.md`
2. Add frontmatter (see template below)
3. Write body in Markdown
4. `git add . && git commit -m "Publish analysis: Your Title" && git push`
5. Cloudflare Pages auto-builds on push — live in ~2 min

---

## Frontmatter template

```yaml
---
title: "Your Article Title"
description: "One sentence summary shown on the index card and in OG previews."
date: "2026-05-21"
tags: ["playoffs", "preview"]
og_image: "/og/your-slug.png"
status: "published"
author: "Matt Donders"
---
```

**Required fields:** `title`, `description`, `date`, `status`  
**Optional:** `tags`, `og_image`, `author` (defaults to "Matt Donders")

- `status: "draft"` — article won't appear on `/analysis` index. Use while writing.
- `status: "published"` — visible on index, indexed by search engines.
- `date` format: `YYYY-MM-DD` (used for display and sort order).

---

## File naming

```
YYYY-MM-DD-descriptive-slug.md
```

Examples:
- `2026-06-10-stanley-cup-final-preview.md`
- `2026-09-01-offseason-model-updates.md`
- `2026-10-05-season-predictions-2027.md`

The slug in the filename becomes the URL: `/analysis/2026-06-10-stanley-cup-final-preview`

---

## OG image

Put your OG image at `public/og/your-slug.png` and reference it as `/og/your-slug.png` in frontmatter. Recommended size: 1200×630px (Twitter/Bluesky card standard). Existing HGB prediction card PNGs work well here.

If no `og_image` is set, the article page falls back to the site's default OG image.

---

## Markdown conventions

**Internal links to stats pages:**
```markdown
[CAR's playoff lines](/stats/lines?game_type=3&team=CAR)
[Skaters by WAR](/stats/skaters?tab=advanced)
```

**Images:**
```markdown
![alt text](/images/analysis/your-slug/image-name.png)
```
Put images in `public/images/analysis/{slug}/` to keep them organized.

**Pull quotes / callouts:**
```markdown
> The model gives Colorado a 70% chance to advance. History says don't count Vegas out.
```

**Data tables:** Native markdown tables are fine for simple comparisons. Complex tables can use HTML.

**Embedded HGB cards:** Same as regular images — put the PNG in `public/images/analysis/{slug}/` and reference via markdown img tag.

---

## Authoring workflow (full)

```bash
# 1. Create the file
touch src/content/analysis/2026-06-10-stanley-cup-final-preview.md

# 2. Write content (set status: "draft" while writing)

# 3. Preview locally (optional)
npm run dev
# visit localhost:4321/analysis/2026-06-10-stanley-cup-final-preview

# 4. When ready, set status: "published" and commit
git add src/content/analysis/2026-06-10-stanley-cup-final-preview.md
git add public/og/stanley-cup-final-preview.png   # if you have an OG image
git commit -m "Publish analysis: 2026 Stanley Cup Final Preview"
git push

# 5. CF Pages builds automatically — live in ~2 min
# Check: https://hockeygamebot.com/analysis
```

---

## What NOT to do

- Don't put article files anywhere other than `src/content/analysis/`
- Don't use spaces in filenames — use hyphens
- Don't forget the `date` field — the index sorts by it
- Don't set `status: "published"` until the article is ready — drafts don't show on the index
