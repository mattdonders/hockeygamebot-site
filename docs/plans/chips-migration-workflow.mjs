export const meta = {
  name: 'chips-badges-migration',
  description: 'Migrate all hand-rolled chip/pill/badge UI to ChipGroup/StatusPill/Badge components per hgb-docs/CHIPS.md',
  phases: [
    { title: 'Audit',   detail: 'Read each candidate file, confirm what needs migrating' },
    { title: 'Migrate', detail: 'Apply the component swap + remove dead CSS, one agent per file' },
    { title: 'Review',  detail: 'Verify each migrated file against the CHIPS.md checklist' },
  ],
};

// ---------------------------------------------------------------------------
// Candidate files — the UNION of every chip/pill/badge hit from the audit grep,
// plus the noisy false-positive suspects so the Audit phase can reject them.
// teams.astro is excluded (already the reference consumer) and the three
// component files are excluded (they ARE the canonical source).
// One agent owns one file end-to-end so parallel edits never touch the same file.
// ---------------------------------------------------------------------------
const CANDIDATES = [
  // Confirmed: filter chips (btn-group)
  'src/pages/stats/skaters.astro',
  'src/pages/stats/goalies.astro',
  'src/pages/stats/lines.astro',
  'src/pages/stats/interactive.astro',
  'src/pages/stats/index.astro',
  'src/pages/stats/player/[slug].astro',
  // Confirmed: status pills / pulse keyframes
  'src/pages/index.astro',
  'src/pages/games/index.astro',
  'src/pages/teams/[abbr].astro',
  'src/pages/scoreboard.astro',
  'src/pages/results.astro',
  // Confirmed: badges
  'src/pages/analysis/index.astro',
  // Home components flagged for status patterns
  'src/components/home/LiveHero.astro',
  'src/components/home/LiveMomentStrip.astro',
  'src/components/home/TodayHero.astro',
  'src/components/home/TomorrowSlateStrip.astro',
  // Suspected false positives — Audit phase confirms or rejects
  'src/pages/playoffs/2026.astro',
  'src/pages/account.astro',
  'src/pages/home-v3.astro',
  'src/components/GameModal.astro',
  'src/components/Nav.astro',
];

// ---------------------------------------------------------------------------
// Canonical migration rules shared by every audit + migrate agent. Kept terse;
// agents are told to read CHIPS.md and the teams.astro reference for full detail.
// ---------------------------------------------------------------------------
const SPEC = `
CANONICAL SPEC: /Users/mattdonders/Development/hgb/hgb-docs/CHIPS.md (read sections 2,3,4,7,8 fully).
REFERENCE CONSUMER: src/pages/stats/teams.astro — the gametype-filter block shows the exact
ChipGroup usage pattern. Read it before editing.

The three shared components ALREADY EXIST and must NOT be modified:
  - src/components/ChipGroup.astro   (filter chips; emits chip:changed; also sets data-{name}="{value}")
  - src/components/StatusPill.astro  (LIVE/FINAL/OT/PRE/INT/SO game-state pill; owns the ONE pulse keyframe)
  - src/components/Badge.astro       (display-only category badge; kinds: default/solid/red/hot/cold/ot/live/final/mile/matchup)

MIGRATION RULES:
1. FILTER CHIPS (.btn-group): Replace each <div class="btn-group" id="X-filter">...buttons...</div>
   with <ChipGroup id="X-filter" name="X" items={[{label,value,active}]} />.
   CRITICAL — preserve existing JS: the page's click listeners read data-{name}. ChipGroup emits
   data-{name}="{value}" when name="X", and the id keeps querySelector('#X-filter button') working.
   So set name to the SAME token the existing data-* attribute uses (data-strength -> name="strength").
   The page's own filter logic must keep working UNCHANGED. Convert EVERY btn-group on the page, then
   delete the now-unused local .btn-group / .btn-group button CSS rules.
2. STATUS PILLS: Replace inline LIVE/FINAL/OT/PRE/INT/SO status spans with <StatusPill state="..." [label=] [dot=] />.
   Remove any local pulse @keyframes (pulse / pulse-dot / status-pulse / livePulse / etc.) — StatusPill
   owns hgb-status-pulse. Ensure the page :root defines --status-live/#00E5FF, --status-final/var(--ink-48),
   --status-ot/#FF9800, --status-scheduled/var(--ink-48) (StatusPill has fallbacks but add tokens if the
   page already declares a :root). Remove local .status-pill / status-span CSS now handled by the component.
3. BADGES: Replace inline category-badge / .tag / .type-pill markup with <Badge kind="..." label="..." />.
   Pick the closest kind from the reference. Remove local CSS now handled by Badge.
4. Add the import(s) at the top of the frontmatter: import ChipGroup from '<relative>/components/ChipGroup.astro'; etc.
   Compute the correct relative path for THIS file's depth.
5. DO NOT add border-radius. DO NOT use var(--body)/var(--mono) for chip text. DO NOT introduce new pulse keyframes.
   DO NOT change page behavior, data flow, or unrelated markup. Match the surrounding code style.
6. Only migrate genuine chip/pill/badge UI. Score-pills, table heat-cells (pct-pos/pct-neg), and
   multi-select are OUT OF SCOPE (CHIPS.md §10). Leave them alone.
7. NEVER run git stash / git reset / git checkout / git clean / branch switches. You share ONE working
   tree with every other concurrent migrate agent — a stash reverts THEIR in-flight edits and corrupts
   the review phase. To validate, build into a SEPARATE dir (astro build --outDir /tmp/<file>-check) or
   just read the file back. Do not mutate git state.
`;

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'needsMigration', 'chipGroups', 'statusPills', 'badges', 'pulseKeyframes', 'plan'],
  properties: {
    file: { type: 'string' },
    needsMigration: { type: 'boolean', description: 'true only if real chip/pill/badge UI is present (not a false positive)' },
    chipGroups: { type: 'integer', description: 'count of .btn-group instances to convert to ChipGroup' },
    statusPills: { type: 'integer', description: 'count of LIVE/FINAL/OT/etc status spans to convert to StatusPill' },
    badges: { type: 'integer', description: 'count of category-badge/.tag/.type-pill instances to convert to Badge' },
    pulseKeyframes: { type: 'array', items: { type: 'string' }, description: 'names of local pulse @keyframes to remove' },
    hasRootBlock: { type: 'boolean', description: 'whether the file declares its own :root token block' },
    behaviorNotes: { type: 'string', description: 'existing JS filter logic / data-* attributes that MUST keep working' },
    falsePositiveReason: { type: 'string', description: 'if needsMigration=false, why this file was a false positive' },
    plan: { type: 'string', description: 'concise, concrete migration plan for this file' },
  },
};

const MIGRATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'migrated', 'componentsImported', 'chipGroupsConverted', 'statusPillsConverted', 'badgesConverted', 'summary'],
  properties: {
    file: { type: 'string' },
    migrated: { type: 'boolean' },
    componentsImported: { type: 'array', items: { type: 'string' } },
    chipGroupsConverted: { type: 'integer' },
    statusPillsConverted: { type: 'integer' },
    badgesConverted: { type: 'integer' },
    keyframesRemoved: { type: 'array', items: { type: 'string' } },
    tokensAdded: { type: 'array', items: { type: 'string' } },
    cssRemovedSummary: { type: 'string' },
    behaviorPreserved: { type: 'string', description: 'how the existing filter/click JS still works after the swap' },
    uncertainties: { type: 'string', description: 'anything risky or left for human review' },
    summary: { type: 'string' },
  },
};

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'pass', 'issues'],
  properties: {
    file: { type: 'string' },
    pass: { type: 'boolean', description: 'true if migration is correct and complete per the checklist' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'description'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'warning', 'nit'] },
          description: { type: 'string' },
        },
      },
    },
    checklistFails: { type: 'array', items: { type: 'string' }, description: 'CHIPS.md §8 checklist items that fail' },
  },
};

// ===========================================================================
// PHASE 1 — AUDIT (parallel, read-only). Confirm what each file actually needs.
// Barrier here is justified: we need every verdict to (a) log the skipped
// false-positives and (b) hand only the confirmed set to the migrate pipeline.
// ===========================================================================
phase('Audit');
const audits = (await parallel(
  CANDIDATES.map((file) => () =>
    agent(
      `You are auditing ONE file for the HGB chips/pills/badges migration.

FILE: ${file}

${SPEC}

TASK (READ-ONLY — do not edit anything):
1. Read the file in full.
2. Decide whether it contains GENUINE chip/pill/badge UI that this migration covers.
   Many files match the audit grep only incidentally (a CSS class containing the substring
   "live"/"final"/"status", or a score-pill, or a heat-cell). Those are false positives — set
   needsMigration=false and explain in falsePositiveReason.
3. If genuine, count the chipGroups / statusPills / badges, list any local pulse @keyframes,
   note whether the file has its own :root block, and capture the existing JS filter behavior
   (data-* attributes, querySelectors, ids) that the migration MUST preserve.
4. Produce a concrete plan.

Return the structured audit.`,
      { label: `audit:${file.split('/').pop()}`, phase: 'Audit', schema: AUDIT_SCHEMA, agentType: 'Explore' }
    )
  )
)).filter(Boolean);

const confirmed = audits.filter((a) => a.needsMigration);
const skipped = audits.filter((a) => !a.needsMigration);
log(`Audit complete: ${confirmed.length} files need migration, ${skipped.length} false positives.`);
skipped.forEach((s) => log(`  SKIP ${s.file} — ${s.falsePositiveReason || 'no genuine chip/pill/badge UI'}`));
confirmed.forEach((c) =>
  log(`  MIGRATE ${c.file} — chips:${c.chipGroups} status:${c.statusPills} badges:${c.badges} keyframes:[${c.pulseKeyframes.join(',')}]`)
);

if (confirmed.length === 0) {
  log('Nothing to migrate. Exiting.');
  return { audits, confirmed: [], results: [] };
}

// ===========================================================================
// PHASE 2+3 — MIGRATE then REVIEW, pipelined per file. Each file flows through
// migrate -> review independently; a file that finishes migrating gets reviewed
// while others are still migrating. Files are disjoint so parallel edits are safe.
// ===========================================================================
const results = await pipeline(
  confirmed,
  // Stage 1: MIGRATE
  (audit) =>
    agent(
      `You are migrating ONE file to the canonical HGB chip/pill/badge components. Apply real edits.

FILE: ${audit.file}

AUDIT FINDINGS for this file:
- chipGroups to convert: ${audit.chipGroups}
- statusPills to convert: ${audit.statusPills}
- badges to convert: ${audit.badges}
- pulse keyframes to remove: [${audit.pulseKeyframes.join(', ')}]
- has own :root block: ${audit.hasRootBlock}
- behavior to preserve: ${audit.behaviorNotes}
- plan: ${audit.plan}

${SPEC}

TASK:
1. Re-read the file (it may have changed; never assume).
2. Apply the migration precisely per the plan and the rules above. Use the Edit tool.
3. PRESERVE all existing page behavior — especially the filter JS that reads data-* attributes.
   Wire ChipGroup name/id so the existing querySelectors and click listeners keep working unchanged.
4. Convert EVERY chip group on the page (not just one), then remove the now-dead local CSS
   (.btn-group, .status-pill, badge/.tag/.type-pill, and pulse @keyframes that StatusPill now owns).
   Do NOT delete CSS that is still referenced by remaining non-migrated markup.
5. Add the needed component import(s) with the correct relative path for this file's depth.
6. Do NOT touch ChipGroup/StatusPill/Badge/teams.astro. Do NOT change unrelated code.

Be conservative: if a particular instance is ambiguous or out-of-scope (score-pill, heat-cell,
multi-select), leave it and note it in uncertainties rather than guessing.

Return the structured migration report.`,
      { label: `migrate:${audit.file.split('/').pop()}`, phase: 'Migrate', schema: MIGRATE_SCHEMA }
    ),
  // Stage 2: REVIEW (independent verifier)
  (mig, audit) =>
    agent(
      `You are reviewing a just-completed chip/pill/badge migration against the CHIPS.md §8 checklist.

FILE: ${audit.file}
MIGRATION REPORT: ${JSON.stringify(mig)}

${SPEC}

TASK (READ-ONLY — do not edit):
1. Read the current state of the file.
2. Verify against CHIPS.md §8 checklist:
   - Every .btn-group replaced with <ChipGroup>; no leftover hand-rolled btn-group markup/CSS
     UNLESS a remaining instance was intentionally left (check it's truly out-of-scope).
   - Status spans replaced with <StatusPill>; NO local pulse @keyframes remain (only hgb-status-pulse,
     which lives in the component, is allowed).
   - Category badges replaced with <Badge>; dead .badge/.tag/.type-pill CSS removed.
   - Required status tokens present in :root if the file uses StatusPill and declares a :root.
   - Component import paths are correct for this file's depth.
   - No border-radius on chips/pills/badges; no var(--body)/var(--mono) chip text; no hardcoded hex
     where a token exists.
   - Existing filter JS still wired (data-* names/ids match what the JS queries).
3. Flag anything broken or incomplete. A correct, complete migration => pass=true with no blockers.

Return the structured review.`,
      { label: `review:${audit.file.split('/').pop()}`, phase: 'Review', schema: REVIEW_SCHEMA, agentType: 'Explore' }
    ).then((rev) => ({ ...rev, migration: mig }))
);

const clean = results.filter(Boolean);
const failed = clean.filter((r) => !r.pass || (r.issues || []).some((i) => i.severity === 'blocker'));
log(`Migration + review complete. ${clean.length} files processed, ${failed.length} with blockers/failures.`);

return {
  skipped: skipped.map((s) => ({ file: s.file, reason: s.falsePositiveReason })),
  migrated: clean.map((r) => ({
    file: r.file,
    pass: r.pass,
    converted: {
      chips: r.migration?.chipGroupsConverted,
      status: r.migration?.statusPillsConverted,
      badges: r.migration?.badgesConverted,
    },
    keyframesRemoved: r.migration?.keyframesRemoved,
    uncertainties: r.migration?.uncertainties,
    issues: r.issues,
    checklistFails: r.checklistFails,
  })),
  blockers: failed.map((r) => ({ file: r.file, issues: r.issues, checklistFails: r.checklistFails })),
};
