# Progress

_Last updated: 26 October 2026 — first playable review (end of M2 scope, with the gaps listed below)._

## Status

| Milestone | State |
|---|---|
| M0: repo audit, identity, benchmark room, launch | Done |
| M1: complete mechanical loop | Done: one laundrette, 3v3, Ram + Hinge, full round rules |
| M2: first playable review | Mostly done; gaps listed below. **Ready for your feedback on feel.** |
| M3+: six-operator core onward | Not started (by design: review first) |

## What exists

**Stack:** TypeScript 7.0.2 · Phaser 4.2.1 · Vite 8.3.4 · Vitest 5.0.5, with exact pins and a committed lockfile.

The repo started empty apart from the design-pack zip. I moved the pack to the repo root so `CLAUDE.md` loads automatically; its README is now `docs/00_PACK_README.md`.

**Simulation (`src/sim`)**
- Fixed 60 Hz steps with a bounded accumulator. Updates run in the documented order: commands → movement and gadget motion → geometry → perception → actions → deaths → interaction completions → rules → events.
- Swept circle collision against the grid and gadget boxes.
- Hitscan weapons from `data/weapons.json`: seeded spread, damage falloff, one auto-reload when the magazine is empty, and reloads that preserve reserve ammo.
- Wall states:
  - Soft panels (100 HP; gunfire does reduced damage).
  - Reinforced panels (cannot be damaged).
  - Breached panels.
  - Wooden barricades (40 HP).
  - A window vault link.
  - All wall changes apply through one geometry revision, so movement, sight, bullets and navigation stay in sync.
- Objective: arm in 3 s, 30 s broadcast, shut off in 3 s. Interrupt rules and every tie-break from `docs/02` are implemented.
- Prep:
  - Defenders get 2 shared reinforcements and 3 barricades; removing an undamaged barricade refunds it.
  - Teams are confined (attackers outside, defenders inside).
  - Attackers get a shared scouting puck that expires at action start; shooting during prep never costs action ammo.
- **Ram — bumper sled**
  - Charge spent at commit, then a 0.35 s windup.
  - Drives straight at 6 tiles/s for up to 6 tiles.
  - Breaks the first soft panel or barricade it hits, then continues up to 2 tiles.
  - Stops at reinforced or solid walls.
  - Hits each enemy once (20 damage, 0.5-tile shove); stopped by friendlies; deals 60 damage to a Hinge wall.
  - Can be shot (60 HP).
  - Brakes on a tap or at max range and unfolds 1.5-tile cover (120 HP, 12 s) only where there is room.
- **Hinge — pivot wall**
  - 2-tile wall with 160 HP.
  - Can't be placed across protected approaches, the console, spawns, actors or other gadgets.
  - Remote rotate within 6 tiles: 0.25 s warning, then a 0.6 s swing.
  - The whole swing must be clear, otherwise it refuses with a reason and no cooldown is spent.
  - Stalls rather than crushing or shoving anyone.
  - 4 s recovery.
- Side-standard tool: one breach charge per attacker, planted with 0.8 s hold and a 1.2 s fuse.
- Fair perception:
  - 9-tile hard-occluded sight with shared team vision.
  - Sound spreads through rooms, with heavy loss through walls, and gives a fuzzy region estimate, never exact coordinates.
  - Each team only knows wall and barricade states it has actually seen.

**Map:** Spin Cycle (`src/content/spinCycle.ts`) is an authored 36×28 tilemap following `data/maps.json`.
- Rooms: street, shop, service, office (objective), stock and alley.
- Three soft panels (two open into the office) and three barricadable doors.
- Three protected approaches (service→office, office↔stock, alley→stock) plus the always-open service window. These guarantee walking routes from every entry under every legal fortification, which an automated test checks.
- During the first headless runs, defenders could seal the office off from the rest of the building, so I changed the authored layout to the version above.

**Bots (`src/ai`)**
- Each bot decides from what it can perceive: its own sight and hearing, plus teammate reports that arrive after a difficulty-based delay and keep their original timestamps.
- Roles: entry, support and flank on attack; anchor, support and roamer on defence.
- They plan breaches (Ram uses the sled on a soft panel or barricade on its route; squadmates plant charges), stack up at the opening, pick one planter and use the vault window.
- In prep they reinforce and barricade from the objective side, place Hinge's wall at authored sockets, and scout with the puck.
- During action they hold angles, investigate sounds, rotate Hinge when a remembered threat would get a line to the console, and shoot the enemy puck.
- They react with Rookie, Club or Expert reaction times, aim settle and turn rates.
- They repath when walls change; after 0.6 s stuck they recover, and after 2 s they abandon the task and show "Blocked".
- Your squadmates follow orders: Follow, Hold, or Play objective.

**Presentation**
- Original pixel art drawn at native resolution: tiles, 3/4 walls, props (animated washers, the console with idle/arming/armed states), six characters with 8 facings and idle/walk/collapse frames, aim-layer weapons at 16 angles, gadget sprites (pre-rasterised rotations, no blurry rotating), effects, team rings (circle for allies, diamond ticks for enemies) and icons.
- Fog of war:
  - Each living teammate's visibility area is cut out of a dimmed blueprint view of the map.
  - Enemies, enemy gadgets and enemy effects are only drawn when your team can see them.
  - Enemies you've lost sight of become fading hollow "last seen" silhouettes.
- Rain outside, washers spinning, a breach that throws debris and dust with a short light pop, and readable tracers.
- The DOM HUD stays crisp at any size:
  - Clock, side, score and objective line.
  - Squad cards with health and bot status.
  - Contextual Interact button with a progress ring; Gadget button with charge pips and a cooldown ring.
  - Ammo, own health, a low-health vignette, a damage direction marker and a sound-direction arc.
  - Captions and cancel/reason toasts.
- Menus: title (with bots playing live behind it), play/practice setup, operator cards, settings (per-category volume, aim assist off/low/standard, left-handed layout, reduced shake/flash, captions, text size, replay tips), pause, takeover, round result with one real highlight, and match end.
- Controls: floating twin sticks with each pointer tracked separately; gadget press-drag-release with a cancel zone; hold-to-interact; keyboard and mouse. Held inputs reset on pause, blur, app switch, rotation and takeover.
- Audio: synthesized effects for all 43 sound names, rain and city ambience, and calm/tense generative music. Enemy sounds only play if your team actually heard them, muffled through walls.
- Call-outs: the "no API key" version. Short in-character lines (Ram: "Made a door.", Hinge: "Better floor plan.") built only from what your team perceived, such as "Contact, shop!", "Footsteps — service.", "Reinforcing the shop–office wall." Enemy chatter only appears when it carries to you, with a rough direction ("Enemy voice (east): 'Breaching!'").
- First-match tips fade once you've done each action: move, aim, drive the puck, launch the sled, brake, arm; or reinforce, place, rotate.

## How to run

See `README.md`: `npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run sim`.

## Evidence (honest)

| Check | Result |
|---|---|
| `npm run build` (tsc strict + Vite) | Passes |
| `npm test` | 34 tests pass: round tie-breaks (plant on the last tick, shutdown on the last tick, simultaneous wipe, planter killed on the completion tick, wipe after arm), Ram acceptance (breach agrees for sight, bullets and navigation; reinforced stop; one hit per actor; shootable), Hinge acceptance (blocked swing refuses with no clip or cooldown; clear swing updates sight and navigation; stalls instead of shoving; protected placement refused), prep tools, puck, fair perception (a hidden player is never hunted; footsteps give a fuzzy region; delayed teammate intel), map reachability under all 448 fortification×entry combinations, takeover, restart determinism, no stale events after a round ends |
| Headless bot-vs-bot (`npm run sim`) | Rounds finish by every route: elimination, timeout, shutdown and broadcast |
| Browser play, Chromium at 852×393 landscape with real multi-touch events (Chrome DevTools touch input, `pointerType=touch`) | Practice and full best-of-five matches played through the real UI: prep → action → arm/shutoff → takeover → round result → side swap → match end → rematch |
| Restart hygiene, in the browser | 20 restarts through the pause menu: Phaser display objects stay at a flat 89, no gadget leaks, DOM stable |
| Pause while holding fire | Trigger is cleared on resume and no ammo is spent |
| Portrait | Rotate overlay shows and the game pauses |
| Frame pacing | Headless Chromium with **software** WebGL: ~57 fps average, p50 16.6 ms, p95 22.5 ms. Not a phone measurement. |
| Screenshots | `docs/evidence/`: title, setup, attack prep, puck scouting, sled preview, breach, firefight, Hinge swing, takeover, armed defence, round result |

**Not verified**
- **No real iPhone test.** Touch behaviour was emulated in desktop Chromium, so iPhone input, Safari behaviour, performance and audio unlock are all unverified.
- **Audio has never been listened to.** I couldn't hear anything in this environment; the sounds are designed in code and not ear-tested.
- **Balance is untested by humans.** Win rates and how difficult the bots feel need your playtest.

## Known gaps and honest notes

- **Ram/Hinge gadget poses:** Ram has a windup lock and the sled launches from him, but there is no dedicated brace pose. Hinge has no lever pose. Both use walk/idle frames, and the gadgets themselves animate.
- **Tutorial:** fading first-match tips, not the scripted mini-tutorial room from `docs/02` (walk to door → shoot a target → sled → panel → console).
- **Orders:** Follow, Hold and Play objective apply to all teammates. There is no per-teammate targeting and no "Breach" order with a ready/Go flow yet.
- **Persistence:** only settings are saved locally. XP, mastery, unlocks and export/import are M4.
- **No 30 fps reduced-effects mode** yet; the "reduce flashes" and "reduce shake" settings exist.
- **Squadmates** are temporary basic operators, as the slice allows. Defender bots on Club currently win a bit more often in bot-vs-bot runs.
- **Aim assist** is implemented as an 8°/4° attraction cone, but its strength has not been tuned on a phone.
- **Dev-only extras:** `window.__bc` (an autopilot and speed control used for automated browser tests) exists only in dev builds and is compiled out of `npm run build`. `/dev/art.html` is an art review sheet.

## Next: highest-value polish pass

1. **Play it on your iPhone** (`npm run dev`, open the Network URL) and judge stick feel, aim assist strength, button reach and audio. That decides the next tuning far more than anything else.
2. **Gadget character poses:** a Ram brace/launch frame and a Hinge lever-pull frame, plus a short scripted tutorial room for the sled and the swing.
3. **Bot squad spacing and attack timing:** allies still bunch up near you at doorways, and attack bots could coordinate a breach-then-push more clearly (use the documented "ready → Go" flow).
4. **Low-quality mode** and an on-device performance measurement.
