# BREACH CLUB — Claude Code production pack
Version 1.0 • 26 October 2026

A proper 2D pixel-art, mobile-first, single-player squad breaching game against bots. Quick attack/defend rounds; original operators whose gadgets change movement, rooms, information, and decisions.

This archive is a design and implementation handoff, not a playable game. No game art, audio, paid assets, engine installation, or finished application is included. Numerical values are initial playtest hypotheses.

## Start here
1. Extract this folder into your GitHub repository. On iPhone, download the ZIP and open it in Files to extract it; upload the extracted files to your repo using your preferred GitHub workflow.
2. Connect Claude Code to the repository. Give it START_HERE_PROMPT.md.
3. Claude should read CLAUDE.md, the charter, and milestones before changing code.
4. Build the first playable slice before expanding the roster. Review the actual game on your phone at each milestone.

## Reading order
- docs/01_CHARTER.md: identity and scope.
- docs/02_MATCH_AND_OBJECTIVES.md: complete rules and edge cases.
- docs/03_OPERATOR_BIBLE.md: twelve original characters, input, limitations, counters, bot use, and tests.
- docs/04_COMBINATIONS.md: explicit interaction rules and enjoyable tactics.
- docs/05_MOBILE_UI.md: screens, touch, accessibility, feedback.
- docs/06_COMBAT_AND_DESTRUCTION.md: shooting, wall states, cover, visibility.
- docs/07_BOTS.md: fair perception, squad roles, gadget behaviours.
- docs/08_MAPS.md: authored map layouts and validation.
- docs/09_ART_AUDIO.md: pixel identity and asset production.
- docs/10_PROGRESSION.md: unlocks without stat inflation.
- docs/11_ARCHITECTURE.md: implementation contracts and persistence.
- docs/12_MILESTONES.md and docs/13_QA.md: delivery gates.

BREACH_CLUB_MASTER_PLAN.md combines the design chapters for convenient reading. Individual chapters are canonical when editing; regenerate the master afterwards. JSON files are starter design fixtures, not an implemented game API. Run python3 tools/validate_pack.py to check their references and basic invariants.

## Scope labels
Slice = one map, Ram and Hinge selectable, supporting bots with basic weapons, full round rules.
Core = six playable operators and dependable 3v3 bot matches.
Expansion = twelve operators and three maps only after the core is demonstrably fun.
Names are working names; conduct naming and trademark clearance before commercial release.
