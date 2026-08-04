import { defineConfig } from 'vitest/config';

/**
 * Minimal unit-test config: PURE LOGIC ONLY (src/lib and similar).
 *
 * Deliberately no jsdom / Testing Library / Astro integration — component and
 * integration testing is a separate, heavier decision. Modules under test that
 * touch `window.localStorage` / `sessionStorage` stub it themselves (see
 * src/lib/__tests__/test-storage.ts), which keeps the default `node`
 * environment — and the dependency footprint — as small as possible.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
