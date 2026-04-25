import { defineConfig } from 'astro/config';

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
  output: 'static',
  site: 'https://hockeygamebot.com',
  integrations: [devOnlyRoutes],
  vite: {
    server: {
      allowedHosts: ['cygnus'],
    },
  },
});
