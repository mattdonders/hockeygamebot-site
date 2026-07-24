# HGB-site v2 — agent prompt

Paste the block below to an agent working in this (`hockeygamebot-site`) folder. It
redesigns the site using the editorial design system from the sibling `wnba-site`
project, with HGB's own brand palette, and reconsiders the static-Astro stack.

---

You're building HGB-site v2 — a redesign of this hockeygamebot site. I just built a
sibling project (wnba-site) whose design I love, and v2 should inherit that design
system while using HGB's own brand palette and content. Two goals: (1) adopt the
editorial design system, (2) reconsider the stack, because I think we've been shoving
too much into static Astro and it's starting to fight us.

DON'T big-bang rewrite the live site. Build v2 alongside (new branch, or a /v2 working
area) so we can iterate without touching what's deployed. Enter plan mode and get my
approval on a plan before writing code.

STEP 1 — Study the design reference (read these, don't guess):
  ~/Development/wnba-site/src/app.css                  ← the whole token system
  ~/Development/wnba-site/src/routes/+layout.svelte    ← masthead, footer, theme toggle
  ~/Development/wnba-site/src/routes/+page.svelte      ← home dashboard
  ~/Development/wnba-site/src/routes/players/+page.svelte and players/[id]/+page.svelte
  ~/Development/wnba-site/src/lib/data.ts              ← the data seam pattern
  ~/Development/wnba-site/README.md                    ← architecture + migration notes

  What makes it feel "editorial/sleek" and must carry over:
   • Type pairing: Fraunces (optical serif) for display + system sans for body.
   • Warm paper, never pure white/black (paper #fbf9f5, ink #1a1714 in light mode).
   • Restrained tables: uppercase letter-spaced column heads, ONE heavy rule under the
     header, hairline row rules, NO zebra striping, tabular-nums so digits align.
   • Accent color rationed — only key numbers, abbreviations, and links. Never fills.
   • Consistent kicker → headline → dek rhythm on every page.
   • Everything driven by CSS custom properties (:root light, [data-theme] dark) so the
     palette is swappable. Dark mode set pre-paint via inline script; toggle persists.

STEP 2 — Audit THIS site (hockeygamebot-site) and report back before proposing:
   • Current stack (I believe Astro + React + @tanstack/react-table/virtual → Cloudflare
     Pages static dist — verify). List every page/route and what data each needs.
   • Where the data comes from and how it's fetched/built. Identify specifically what's
     "shoved into static": anything that wants to be dynamic (live scores, frequent
     updates, per-request data, large tables prerendered at huge cost) and is currently
     forced through a static build.

STEP 3 — Propose the v2 stack as an explicit recommendation with tradeoffs. My strong
   prior (tell me if you disagree and why): move to SvelteKit (Svelte 5, runes) on
   Cloudflare Workers with a lib/data.ts data seam — same as wnba-site — so the two are
   true siblings sharing the design system. The Workers target makes a runtime data
   layer (KV/D1/R2, SSR for the dynamic stuff) easy where Astro static is fighting us,
   while still prerendering the static pages. Confirm whether the @tanstack/react-table
   usage has a Svelte equivalent or whether we keep React islands for those heavy tables.

STEP 4 — After I approve the plan: port the design system (app.css tokens, but with
   HGB's brand palette, NOT WNBA orange — pull HGB's current colors), then build 2–3
   representative pages well (pick the highest-value ones from the audit) to prove the
   stack + design end to end. Don't try to rebuild everything — give me a sleek,
   working slice I can react to, and we iterate from there.

Notes: keep it a separate v2 so the live site is untouched; follow the repo's existing
conventions where they don't conflict with the above; the design tokens are the shared
contract between this and wnba-site, so structure app.css the same way.

---

## Context for whoever opens this later

- **Why this exists:** wnba-site (`~/Development/wnba-site`) is a SvelteKit (Svelte 5) /
  Cloudflare Workers stats site with an editorial design system. We deliberately built
  it as a "sibling" to HGB so the design (tokens in `src/app.css`) is portable — rebrand
  by swapping the palette, keep the type scale / table treatment / spacing.
- **The stack question is genuinely open.** The recommendation is SvelteKit-on-Workers,
  but if HGB's React table virtualization (or anything else) is load-bearing, the agent
  should say so rather than match wnba-site blindly.
- **Scope is a slice, not a migration.** Prove the design + stack on 2–3 pages first.
