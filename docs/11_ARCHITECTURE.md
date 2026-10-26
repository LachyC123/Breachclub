# 11 — Technical implementation contract
## Proposed stack and verification
For a new repo use TypeScript + Phaser + Vite, subject to verifying compatible current releases and the repo's existing stack. Pin exact installed versions and lockfile. This pack contains no dependency versions or executable app. At implementation time consult official sources: https://docs.phaser.io/ , https://vite.dev/guide/ , https://www.typescriptlang.org/docs/ and https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API . These are reference destinations, not claims that documentation was retrieved or APIs tested while writing this pack.

## Suggested source ownership
src/app boot, loading, scene routing; src/sim state, fixed update and events; src/content validated definitions; src/systems movement, combat, visibility, audio perception, objectives, geometry, abilities; src/ai perception memory and decisions; src/render sprites/fog/effects; src/ui touch and menus; src/persistence schema/migrations/import; tests simulation invariants and browser flows. Choose modules for responsibility, not one class per trivial value.

Simulation advances at fixed 60Hz with a bounded accumulator. Rendering interpolates where appropriate. On hidden page or explicit pause stop simulation; do not process minutes of missed frames on resume. Commands are queued with actor ID, target, sequence, and sim tick. Bots and humans use the same action interfaces. Presentation reads state/events; animation completion never decides whether a wall was destroyed or reward granted.

Update order: consume commands → move/resolve collisions and active gadget motion → update geometry revisions → recompute relevant sight/perception → execute validated actions/shots → resolve damage/death → surviving interaction completions → round elimination/timer rules → emit presentation events. Bot decisions consume last complete perception snapshot and queue next-tick commands. Maintain exact documented objective tie-breaks.

## Ability interface
Definitions hold ID, charges, cooldown, targeting mode, tags and parameters. Instances hold owner, remaining uses, current action, cooldownUntil and deployed entity IDs. Lifecycle: idle → preview → validated commit → wind-up → active → recovery → idle/exhausted. Cancellation and charge-spend moment are ability-specific as defined in the bible. validateTarget returns allowed plus human-readable reason and geometric preview, never secret actor details. emit once-per-action events with unique ID to avoid duplicated sound/VFX. Serialise primitive data only.

## Geometry model
Grid for authoring and broad phase, explicit segments/polygons for shot and sight obstruction, actor-radius navigation clearance. Geometry revision is authoritative for all consumers. Hinge rotating shape may use conservative occupancy for nav but actual rotating segment for visible shots; document this and test apparent edge cases. Swept movement cannot tunnel through a one-tile obstruction. Deterministic wall states include intact, reinforced, window, breached, foam-plugged. Cover uses independent entity IDs and HP; a moving shield is not rebuilt as a new full-health object.

## Data fixtures
data/operators.json mirrors the detailed operator bible. Narrative fields are design instructions, not strings a runtime interpreter should execute. Convert numeric mechanics into typed parameter schemas as each ability is implemented. data/maps.json is a topology seed for manual tilemap authoring. data/weapons.json and data/rules.json provide initial numerical settings. Validate all identifiers and references before launching; report missing assets visibly rather than silent invisible sprites.

## Saves and pause
IndexedDB versioned saves: profile XP/unlocks/mastery/settings; match snapshot only at start of each round; unique reward ledger. Mid-round pause keeps live state in memory; page reload restarts that round from its initial seed, squad and geometry, with no duplicated rewards. UI states this clearly. Persist after each match result in one transaction with the ledger. Keep a previous valid backup, validate imported JSON limits/IDs/types, and migrate known versions. Unknown future schemas are rejected with explanation, not overwritten. Browser data can be cleared/evicted; export/import is a visible setting. A save is local, not automatically synced between phone and computer.

## Performance and diagnostics
Profile six actors, several deployed gadgets, fog, moving cover, simultaneous breach and UI on a representative map. Cache room visibility geometry; dirty only changed cells. Pool particles and tracers, cap sound voices, avoid creating new textures each frame. Starting targets: steady 60fps high mode, stable 30fps low mode; low mode reduces decorative particles and lighting, never sensing/AI rules. Device memory/load time budgets are measured before choosing atlas/audio sizes.

Development-only test bridge exposes reset(seed), readSnapshot(), stepTicks(n), and loadScenario(id). Strip mutation hooks in release. Log geometry revision, round reason, ability action ID, and perception source for debugging. No private keys, cloud AI service, tracking SDK or backend needed. Automated desktop tests supplement, not replace, actual phone playtesting.
