import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

/**
 * Dev-only preview integration.
 *
 * Files under `src/_dev/stats/*.astro` are internal design/debug pages that
 * must NOT ship to production (they leak source-hash, implementation-stage
 * labels, and component scratch work). The folder name starts with `_` so
 * Astro's routing ignores it by default.
 *
 * In dev-server mode (`astro dev`) we inject those files as routes under
 * `/stats/dev/*` so developers can still preview them locally. `astro build`
 * skips the injection entirely — production gets zero dev routes.
 *
 * Exception (SITE-HOME-02): `/_dev/artifacts` ships in production builds
 * too, but with a `noindex,nofollow` meta tag in its <head> so search
 * engines ignore it. The user reviews the artifact-card library on the
 * Cloudflare Pages preview URL — without this exception, every Layer 2
 * iteration would require running `astro dev` locally on a remote host.
 */
const devOnlyRoutes = {
  name: 'hgb-dev-only-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute, command }) => {
      // Dev-only routes (skipped in `astro build`).
      if (command === 'dev') {
        injectRoute({
          pattern: '/stats/dev/components',
          entrypoint: './src/_dev/stats/components.astro',
        });
        injectRoute({
          pattern: '/stats/dev/data',
          entrypoint: './src/_dev/stats/data.astro',
        });
      }

      // Production-visible-but-noindex dev gallery — for Cloudflare Pages
      // preview review on PRs touching the artifact library.
      injectRoute({
        pattern: '/_dev/artifacts',
        entrypoint: './src/_dev/artifacts/index.astro',
      });
    },
  },
};

export default defineConfig({
  // Hybrid: every page prerenders to static HTML by default (unchanged). Only
  // routes that `export const prerender = false` (e.g. the public Puck Passport
  // profile) render on-demand in the Cloudflare Worker — so a runtime-created
  // handle gets a server-rendered page + per-handle OG preview instantly, which
  // static output can't do. See src/pages/puck-passport/[handle].astro.
  output: 'static',
  adapter: cloudflare(),
  site: 'https://hockeygamebot.com',
  redirects: {
    '/analytics/lines':       '/stats/lines',
    '/analytics/wowy':        '/stats/wowy',
    '/analytics/interactive': '/stats/interactive',
  },
  integrations: [react(), sitemap(), devOnlyRoutes],
  vite: {
    define: {
      // Preview-only changelog fixture switch (src/lib/passport-changelog-preview-fixture.ts).
      // CF_PAGES_BRANCH is auto-injected by Cloudflare Pages at build time — 'main' for the
      // production build, the branch name for every preview build. Baking this to a literal
      // boolean at build time means the fixture path can never be reached in a production
      // build, with no dashboard configuration required. Local `astro dev`/`build` (where
      // CF_PAGES_BRANCH is unset) also resolves to false.
      'import.meta.env.PUBLIC_CHANGELOG_FIXTURE': JSON.stringify(
        !!process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== 'main',
      ),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      // @astrojs/react imports `react-dom/server`, which the package export map
      // resolves to `server.browser.js` under the worker/browser condition. That
      // build references `MessageChannel` unguarded at module init and crashes
      // the Cloudflare Workers runtime (workerd) at startup once the adapter
      // bundles renderers into the on-demand `_worker.js` (verified: server.browser
      // has the ref, server.edge/server.node have zero). Force the edge build,
      // which uses Web Streams and works in both workerd and Node prerendering.
      // SSR-only (build-time prerender + worker); client hydration uses react-dom/client.
      alias: {
        'react-dom/server': 'react-dom/server.edge',
      },
    },
    server: {
      allowedHosts: ['cygnus'],
    },
  },
});
