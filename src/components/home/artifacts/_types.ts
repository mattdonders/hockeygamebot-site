/**
 * Shared TypeScript types for artifact components (SITE-HOME-02 / Layer 2).
 *
 * Lives in a `.ts` file (not a `.astro` frontmatter) so other Astro
 * components can `import { type ArtifactTag }` from here without esbuild
 * tripping over the .astro frontmatter wrapper. Keep prop-shape types
 * inside the `.astro` files; only the SHARED types live here.
 */

export type ArtifactTagKind =
  | 'red'
  | 'hot'
  | 'cold'
  | 'game'
  | 'mile'
  | 'line'
  | 'matchup'
  | 'stars'
  | 'goalie'
  | 'neutral';

export interface ArtifactTag {
  /** Short label, shown UPPERCASE; emoji+text OK ("⚡ Game of night"). */
  label: string;
  /** Tag color kind — keys map to status colors in site-tokens.css. */
  kind?: ArtifactTagKind;
}

export interface ArtifactByline {
  /** Left side — usually "HOCKEYGAMEBOT.COM / SECTION" */
  left?: string;
  /** Right side — short identifier (player name, score, etc.) */
  right?: string;
}
