# Contributing

## Astro inline script rule

Astro processes `<script>` blocks in `.astro` files through esbuild — TypeScript is supported there. However, `<script is:inline>` is shipped **raw to the browser** without compilation.

Rules:
- Plain `<script>` (no `is:inline`) — TypeScript annotations are safe, esbuild compiles them.
- `<script is:inline>` — must be plain JavaScript. No `: Type` annotations, no `as Type` casts. They will cause a syntax error in the browser.
- Never add `lang="ts"` to a client-side script without confirming Astro's compilation pipeline handles it in that context.

## Type checking

```bash
npm run check     # runs astro check (TypeScript + Astro diagnostics)
npm run build     # full static build (~5,000+ pages)
```

Run `npm run check` before pushing. The build will pass even with type errors since `@astrojs/check` is a separate step.

## API contract

- Build-time stats come from `api.hockeygamebot.com/v1/stats/*` (R2-backed). Fetched once in `src/lib/stats-loader.ts` at build time.
- Live game data is fetched client-side from the same API base (D1-backed).
- Homepage uses `/v1/scoreboard`. Scoreboard page uses `/v1/games/today`. These are different endpoints with slightly different shapes — do not consolidate without checking both pages.
- No page should call `/v1/game-state` — that endpoint does not exist.
