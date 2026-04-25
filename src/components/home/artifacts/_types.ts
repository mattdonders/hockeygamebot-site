/**
 * Shared TypeScript types for artifact components (SITE-HOME-02 / Layer 2).
 *
 * Lives in a `.ts` file (not a `.astro` frontmatter) so other Astro
 * components can `import { type ArtifactTag }` from here without esbuild
 * tripping over the .astro frontmatter wrapper. Keep prop-shape types
 * inside the `.astro` files; only the SHARED types live here.
 */

/**
 * Tag color kind. Each value maps to a CSS class on `.art-tag` — see the
 * `.art-tag--*` rules in ArtifactShell.astro for the full kind→color
 * lookup. Pick the kind that MATCHES the card's accent (so a tag on a
 * HOT card reads green, a tag on a MILESTONE card reads gold, …) or
 * `neutral` if the tag should step out of the card's visual language.
 */
export type ArtifactTagKind =
  | 'red'
  | 'hot'
  | 'cold'
  | 'game'
  | 'ot'
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
