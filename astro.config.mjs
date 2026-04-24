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
 */
const devOnlyRoutes = {
  name: 'hgb-dev-only-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute, command }) => {
      if (command !== 'dev') return;
      injectRoute({
        pattern: '/stats/dev/components',
        entrypoint: './src/_dev/stats/components.astro',
      });
      injectRoute({
        pattern: '/stats/dev/data',
        entrypoint: './src/_dev/stats/data.astro',
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
