/**
 * Build-time artifact-mock loader (SITE-HOME-02 / Layer 2).
 *
 * Imports each `src/data/home-mock/artifacts/*.json` mock fixture and
 * runs it through the matching Zod schema in `artifact-schemas.ts`. On
 * failure the build errors out with a path-aware message instead of
 * silently rendering `undefined` in the dev gallery.
 *
 * Usage:
 *   import { loadArtifact } from '../../lib/artifact-loader';
 *   const game = loadArtifact('game');
 *   <ArtifactGame {...game} />
 *
 * Mock-vs-production:
 *   These mocks live behind the loader for the dev gallery. When the
 *   eventual Python card-generator pipeline produces real JSON (Layer 6+),
 *   the bot itself will import these schemas as the source of truth and
 *   write payloads that pass them.
 */

import gameData from '../data/home-mock/artifacts/game.json';
import hotData from '../data/home-mock/artifacts/hot.json';
import coldData from '../data/home-mock/artifacts/cold.json';
import milestoneData from '../data/home-mock/artifacts/milestone.json';
import lineData from '../data/home-mock/artifacts/line.json';
import matchupData from '../data/home-mock/artifacts/matchup.json';
import clinchData from '../data/home-mock/artifacts/clinch.json';
import seasonData from '../data/home-mock/artifacts/season.json';
import hattrickData from '../data/home-mock/artifacts/hattrick.json';
import starsData from '../data/home-mock/artifacts/stars.json';
import goalieData from '../data/home-mock/artifacts/goalie.json';

import {
  ARTIFACT_SCHEMAS,
  parseArtifactOrThrow,
  type ArtifactSlug,
  type ArtifactDataMap,
} from './artifact-schemas';

const RAW: Record<ArtifactSlug, unknown> = {
  game: gameData,
  hot: hotData,
  cold: coldData,
  milestone: milestoneData,
  line: lineData,
  matchup: matchupData,
  clinch: clinchData,
  season: seasonData,
  hattrick: hattrickData,
  stars: starsData,
  goalie: goalieData,
};

// Validate everything at module load — build fails on drift, not later.
const VALIDATED: { [K in ArtifactSlug]: ArtifactDataMap[K] } = {
  game: parseArtifactOrThrow(ARTIFACT_SCHEMAS.game, RAW.game, 'artifacts/game.json'),
  hot: parseArtifactOrThrow(ARTIFACT_SCHEMAS.hot, RAW.hot, 'artifacts/hot.json'),
  cold: parseArtifactOrThrow(ARTIFACT_SCHEMAS.cold, RAW.cold, 'artifacts/cold.json'),
  milestone: parseArtifactOrThrow(ARTIFACT_SCHEMAS.milestone, RAW.milestone, 'artifacts/milestone.json'),
  line: parseArtifactOrThrow(ARTIFACT_SCHEMAS.line, RAW.line, 'artifacts/line.json'),
  matchup: parseArtifactOrThrow(ARTIFACT_SCHEMAS.matchup, RAW.matchup, 'artifacts/matchup.json'),
  clinch: parseArtifactOrThrow(ARTIFACT_SCHEMAS.clinch, RAW.clinch, 'artifacts/clinch.json'),
  season: parseArtifactOrThrow(ARTIFACT_SCHEMAS.season, RAW.season, 'artifacts/season.json'),
  hattrick: parseArtifactOrThrow(ARTIFACT_SCHEMAS.hattrick, RAW.hattrick, 'artifacts/hattrick.json'),
  stars: parseArtifactOrThrow(ARTIFACT_SCHEMAS.stars, RAW.stars, 'artifacts/stars.json'),
  goalie: parseArtifactOrThrow(ARTIFACT_SCHEMAS.goalie, RAW.goalie, 'artifacts/goalie.json'),
};

export function loadArtifact<T extends ArtifactSlug>(slug: T): ArtifactDataMap[T] {
  return VALIDATED[slug];
}

export const ARTIFACT_RAW = RAW;

export type { ArtifactSlug };
