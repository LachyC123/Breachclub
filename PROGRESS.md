# Progress

_Last updated: 27 October 2026 — arcade pass: punchy combat, scoring and announcer, barrels, wild card draft._

## Status

| Milestone | State |
|---|---|
| M0: repo audit, identity, benchmark room, launch | Done |
| M1: complete mechanical loop | Done: one laundrette, 3v3, Ram + Hinge, full round rules |
| M2: first playable review | Done, then reworked after your feedback (below). **Ready for a second look.** |
| M3+: six-operator core onward | Not started (by design: review first) |

## Arcade pass (27 Oct 2026, latest)

Your feedback: it isn't arcadey or fun enough, and shooting feels flat. You picked faster/punchier combat, arcade scoring with an announcer, and more destruction, and asked for a FragPunk-style card draft between rounds.

**Punchier combat**
- Faster pace:
  - Walk speed 3 → 3.8 tiles/s.
  - Damage up: SMG 22, carbine 30, scattergun 14 per pellet.
  - Rounds now last about a minute.
- **Slide** (button, or Space on desktop):
  - A 0.32 s burst at 2.3× speed, with a 2.2 s cooldown and extra spread while sliding.
  - Bots slide into cover and sometimes while strafing.
- **Hit-stop** on your kills.
- **Pixel damage numbers:** one per target per shot, red on a kill, green for poison and heals.
- A kill burst, shake when you're hit, and a slow-motion zoom-in on the round's final kill.
- Bots holding an angle react faster to targets that walk into their aim, so faster attackers don't simply win. Bot-vs-bot balance is roughly even.

**Arcade scoring** (`src/app/scoring.ts`, same rules for bots)
- **Points:**
  - Kills, assists, first blood, trades.
  - Double and triple kills, ACE, CLUTCH, streaks.
  - Arming and shutting off the console, breaches, drone tags, fortifying, sled hits, round wins.
- Actions chained within 5 s build a combo multiplier, up to ×2.
- **Announcer:** FIRST BLOOD, DOUBLE KILL, ACE, CLUTCH, DEFUSED, ON A ROLL. These are text banners with synthesized stingers (no voice service); enemy feats show smaller in red.
- **Round summary:** your rank (S–D), points and medals:
  - MVP, Hunter, Sharpshooter, Wrecker, Eagle Eye, Bulwark, Objective, Survivor.
- The scoreboard and MVP use points.

**Destruction** (`src/sim/explosions.ts`)
- **Shared explosion:**
  - Damage falls off with distance and hard walls block it.
  - No friendly fire, but you take half of your own blast.
  - Blasts shove people, chain into other barrels, and blow open unreinforced soft walls and barricades.
- **Explosive barrels:** 9 on Spin Cycle and 4 in the range (respawning).
  - Shoot one and it flashes and hisses for 0.4 s, giving people time to get clear, then explodes.
  - Untouchable during prep.
  - Bots shoot a barrel next to an enemy when no teammate is in the blast, and defenders don't camp beside barrels.

**Wild card draft** (`src/content/cards.ts`, `src/sim/cards.ts`, `src/ui/draft.ts`)
- Before every round, your squad is dealt three face-down cards. You flip them, see your teammates' votes, and play one. The opponents' pick is revealed next.
- Cards last the whole match; drafting a card you already have levels it up (max level 3). Nothing carries beyond the match.
- **Common:** Adrenaline (speed), Hollow Points (damage), Kevlar (max HP), Quickdraw (reloads, spare mags).
- **Rare:** Vampire (kills heal), Ghost Step (quiet footsteps), Recon Pulse (pings every enemy on an interval).
- **Epic:**
  - **Poison Rounds:** damage over time.
  - **Explosive Rounds:** every Nth bullet blows up.
  - **Aimbot:** a hard aim snap, but only onto enemies you can see.
  - **Sentry Turret:**
    - An auto-gun that only shoots enemies it can see, after a reaction delay.
    - 70 HP, lasts 30 s, can be shot down.
  - **Missile Strike:**
    - Drag to aim, with a cancel zone.
    - A 1.6 s warning zone that both teams see, with a siren.
    - A 2.6-tile blast that opens walls.
- Active cards give the team charges each round, shown as TURRET and MISSILE buttons (T and X on desktop).
- Bots drop turrets when holding or stacked, call missiles on enemies they've just seen and away from teammates, and shoot enemy turrets. Your squad's bots leave active cards to you while you're alive.
- The range gives you both active cards to practise with, and they recharge.

**Tests:** 56 pass. New this pass:
- Slide.
- Scoring rules.
- Explosions: blast, shelter, friendly fire, chains, walls, prep.
- Every card's effect, refusal and counterplay, plus turret and missile lifecycles.

A headless stress run (`SIM=1 CARDS=4`) with random cards on both sides finishes every round with no errors. The cards get used: 15 turrets and 16 missiles over 24 rounds.

## Feel pass (27 Oct 2026, later)

Your feedback: bots still dumb (one defender walked straight to our entry door and died), more feel and VFX wanted, and operators and guns all felt the same.

**Bots**
- Measured first with a diagnostic over 24 bot-vs-bot rounds (`tests/defdeaths.sim.ts`): 44 of 57 defender deaths came in the first 30 s of action, 33 outside the office. Most were roamers holding the service room right next to the window spawn.
- Root causes found and fixed:
  - **Prep bug:** defenders could see attackers through the window during prep and emptied magazine after magazine at them (nobody can be hurt in prep), freezing in place until action started. Bots now only shoot drones in prep.
  - **Suicidal rotations:** hold spots now score against known threats. A defender never picks a spot within 6 tiles of a known attacker, never crosses their sightlines to rotate, and falls back to site when two or more attackers are close.
  - **Spawn camping:** spots overlooking an attacker spawn are avoided in prep and the first 20 s of action.
  - **Sealed out:** a defender barricaded a door, wandered to the wrong side, then shot its own barricade. Bots never break their own team's barricades in prep and only pick spots they can reach.
  - **Fighting smarter:** bots on both sides break line of sight when facing two or more enemies, and never turn their back at point blank.
- Result: off-site defender deaths 33 → 19. Bot-vs-bot balance over 24 rounds is 12–12.
- New regression test in `tests/ai.test.ts`; it fails on the old AI.

**Operators feel different** (`src/content/handling.ts`)
- Siege-style ARMOUR / SPEED ratings, fixed per operator (not progression):
  - Mo and Dex: light (1 armour / 3 speed).
  - Ram and June: medium (2/2).
  - Tess and Hinge: heavy (3/1).
- Effects: heavy operators take 20% less gunfire damage and move 12% slower; light ones the reverse.
- The sprites show it: light operators wear a chest strap, medium a vest, heavy a plate carrier with shoulder plates. Walk cadence follows speed.
- Ratings are shown as pips on operator select and in the operators browser.

**Guns feel different**
- **Carbine (marksman):** pin-point first shot; punished for moving and holding the trigger; heavy kick and stagger after each shot; the brightest, longest tracer.
- **Pocket SMG (run-and-gun):** forgiving on the move, sprays wider the longer you hold it; light kick; quick thin tracers.
- **Scattergun (pump):**
  - Knocks targets back and throws bodies further.
  - Big flash, smoke and camera shake.
  - A pump clack in its sound, with the red shell ejecting a beat after the blast.
  - Loads shell by shell; firing interrupts the reload.
- Each gun also has its own aim-down-sights movement speed. Weapon stat bars are shown on operator select.
- Tests: armour damage, speed difference, and shell reload with interrupt (`tests/handling.test.ts`).

**VFX and feel** (`src/render/fx.ts`)
- Shell casings that bounce and lie on the floor.
- A pixel-banded muzzle light pop.
- Muzzle smoke, plus sparks off walls and metal, plaster or wood puffs off soft surfaces.
- Persistent decals: bullet holes, blood spatter and pools, charge scorch marks.
- Breach shockwave ring, sparks and smoke.
- Bodies thrown away from the shooter; per-weapon camera recoil kick.
- A red screen-edge flash when you're hit, and an "ELIMINATED NAME +100" popup on your kills.
- All of it respects fog: effects only appear where your team can see.

## Feedback pass (27 Oct 2026)

Your feedback: the layout, menus and practice didn't feel like a tactical shooter, the drone phase was bad, the bots were dumb, and aiming, camera, pace and menus all felt wrong. You chose CODM-style controls and prep-only drones.

**Flow and menus** (`src/ui/menu.ts`, `src/ui/screens.ts`)
- Tabbed home over a live bot round: PLAY / OPERATORS / TRAINING / SETTINGS.
- Playlists: Quick Match (first to 2, 20 s prep) and Standard (first to 3), plus a difficulty and starting-side choice.
- Training: Shooting Range, and two single-round situations (Breach & Arm, Hold the Office).
- Match flow:
  1. Loading screen (map, squads, objective).
  2. Every round: operator and primary-weapon select with a 20 s auto-lock. Teammates take the operators you leave, and future operators show as locked.
  3. Attackers pick a spawn on a map overview.
  4. Preparation, then action.
  5. Round summary with a full scoreboard (score/K/D/A) and a round MVP.
  6. Match results with per-round outcomes and squad totals.
- Visual language: condensed caps, dark angled panels, coral for attack, teal for defence. All styling was rewritten (`src/ui/styles.css`).

**Drones** (replace the shared puck)
- Every attacker has 2 drones. Prep puts you straight onto your drone cam: scanlines, frame corners, "YOUR DRONE 1/2 · CAM 1/3", and the operators wait at spawn.
- The left stick drives. **TAG** pings every defender the drone can see for 5 s, shown as red diamonds. **NEXT CAM** cycles your squad's drones (view only for theirs).
- The fog shows only what the camera sees.
- One bullet kills a drone, and the spare deploys automatically. Defenders shoot drones on sight (bots after an extra 0.55 s).
- There are "OBJECTIVE LOCATED" and "DRONE DESTROYED" notices, and defenders get a "You've been spotted" warning.
- Tested in `tests/drones.test.ts`.

**Controls, camera, feel**
- CODM-style touch:
  - Left floating move stick.
  - Right floating stick only aims.
  - Big **FIRE** button: hold to shoot, and drag off it to steer while firing.
  - **ADS** toggle: the camera pulls out one zoom step (3× → 2× on a phone, about 2.25× the visible area) over about 0.2 s, and looks further ahead. Move speed is 0.55× and spread 0.4×.
  - Reload, Gadget, and a contextual Interact that only appears when something is in reach.
- Desktop: the mouse aims, left click fires, right click or Shift for ADS, Tab for the scoreboard, C for orders, F to tag, N for the next cam.
- Laser sight from the muzzle to the first sight blocker. It turns red when it lies on a visible enemy.
- Touch aim assist is stronger: 10° normally, 14° in ADS. It is stickier while firing and still never acts through cover or fog.
- Integer camera zoom (about 8.5 tiles tall, so characters are about 3× larger on a phone) with aim look-ahead.
- Feedback:
  - Hit markers (white) and kill markers (red), each with its own synthesized sound.
  - A kill feed.
  - An **ELIMINATED BY <name> · weapon · distance** panel, with the camera holding on your killer for 1.8 s before takeover.
- HUD layout: the top strip shows both squads' portraits (crossed out when dead), the score, round number, clock and phase; vitals sit bottom-left, ammo and weapon bottom-right.

**Shooting range** (`src/app/rangeRunner.ts`, `src/content/rangeMap.ts`, `src/sim/range.ts`)
- Three lanes of targets at roughly 5, 10 and 16 tiles, some strafing, plus a breach house whose walls and barricade regrow and whose console resets.
- Gadgets and ammo refill. Any of the six playable operators, with any of their weapons.
- Live target, accuracy and hit counters; a scattergun blast counts as one shot.

**Bots** (`src/ai/*`, rewritten before this pass and fixed during it)
- Covered by the earlier rework: tactical holds with watch angles, attack plans with stack points and a flank, danger-aware pathing, burst fire, settle time, and limited fallback to cover.
- New fix: your escorting squadmates now arm the console themselves if you stand on site without arming while the clock runs low, or if you are far from site. Tested in `tests/ai.test.ts`; the test fails on the old code.
- New fix: the dev autopilot (used to play-test in the browser) is now counted as a bot by planning and planting. It previously timed out 4 of 12 attack rounds; it now times out 0 of 16.

**Architecture**
- `app.ts` was 1,031 lines and is now split into:
  - `app.ts`: shell and menu.
  - `matchRunner.ts`: round flow.
  - `rangeRunner.ts`.
  - `playInput.ts`: controls → intent, gadgets, aim assist.
  - `feedback.ts`: events → audio, HUD and kill feed.
  - `ctx.ts`.
- Maps come from a registry (`buildMap('spin_cycle' | 'range')`); textures are keyed per map.

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
  - Every attacker has two recon drones (see the feedback pass above); shooting during prep never costs action ammo.
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
- In prep they reinforce and barricade from the objective side, place Hinge's wall at authored sockets, and drive drones that tag defenders and then back off.
- During action they hold angles, investigate sounds, rotate Hinge when a remembered threat would get a line to the console, and shoot enemy drones.
- They react with Rookie, Club or Expert reaction times, aim settle and turn rates.
- They repath when walls change; after 0.6 s stuck they recover, and after 2 s they abandon the task and show "Blocked".
- Your attacking squadmates escort you by default. Orders: Follow me, Hold here, Push objective, Auto.

**Presentation**
- Original pixel art drawn at native resolution: tiles, 3/4 walls, props (animated washers, the console with idle/arming/armed states), six characters with 8 facings and idle/walk/collapse frames, aim-layer weapons at 16 angles, gadget sprites (pre-rasterised rotations, no blurry rotating), effects, team rings (circle for allies, diamond ticks for enemies) and icons.
- Fog of war:
  - Each living teammate's visibility area is cut out of a dimmed blueprint view of the map.
  - Enemies, enemy gadgets and enemy effects are only drawn when your team can see them.
  - Enemies you've lost sight of become fading hollow "last seen" silhouettes.
- Rain outside, washers spinning, a breach that throws debris and dust with a short light pop, and readable tracers.
- The DOM HUD stays crisp at any size:
  - Top strip with both squads, score, round, clock and phase; objective line.
  - Kill feed, vitals, ammo and weapon readout.
  - Contextual Interact button with a progress ring; Gadget button with charge pips and a cooldown ring.
  - Ammo, own health, a low-health vignette, a damage direction marker and a sound-direction arc.
  - Captions and cancel/reason toasts.
- Menus and HUD were replaced in the feedback pass (above). Settings are grouped as controls, audio and accessibility: per-category volume, aim assist off/low/standard, left-handed layout (mirrors the thumb cluster), reduced shake/flash, captions, text size and replay tips.
- Controls: CODM-style (see the feedback pass), with each pointer tracked separately; gadget press-drag-release with a cancel zone; hold-to-interact; keyboard and mouse. Held inputs reset on pause, blur, app switch, rotation and takeover.
- Audio: synthesized effects for all 47 sound names (new: hit marker, kill confirm, drone tag, drone motor), rain and city ambience, and calm/tense generative music. Enemy sounds only play if your team actually heard them, muffled through walls.
- Call-outs: the "no API key" version. Short in-character lines (Ram: "Made a door.", Hinge: "Better floor plan.") built only from what your team perceived, such as "Contact, shop!", "Footsteps — service.", "Reinforcing the shop–office wall." Enemy chatter only appears when it carries to you, with a rough direction ("Enemy voice (east): 'Breaching!'").
- First-match tips fade once you've done each action: drive and tag with the drone, move, aim and fire, launch the sled, brake, arm; or reinforce, place, swing.

## How to run

See `README.md`: `npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run sim`.

## Evidence (honest)

| Check | Result |
|---|---|
| `npm run build` (tsc strict + Vite) | Passes |
| `npm test` | 41 tests pass (3 new handling tests and 1 new defence AI test in the feel pass). New in this pass: drone lifecycle, tagging, spare deploy, drones gone at action (`tests/drones.test.ts`); escort arming (`tests/ai.test.ts`). The earlier round, gadget, perception, reachability and restart tests still pass. |
| Headless bot-vs-bot, 16 rounds (`SIM=1 SEEDS=1,…,8 npx vitest run`) | 9 attacker / 7 defender wins; 63 kills; 8 drones shot down; one timeout |
| Headless autopilot attack, 16 rounds | 0 timeouts (4 of 12 before the fix) |
| Browser, Chromium at 852×393 landscape with real CDP touch events | Menu tabs → Standard → loading → operator select → spawn select → drone driving and tagging → skip prep → aim stick, FIRE, ADS, scoreboard → autopilot to round end. Also range (select, aim, fire, pause, leave) and a full defence situation through to match end. No page or console errors. |
| Browser, desktop 1280×720 with keyboard and mouse | WASD drone, F tag, right-click ADS with the laser on the cursor, Tab scoreboard |
| Screenshots | `docs/evidence/01–15`: home, training, operators, loading, operator select, spawn select, drone cam, action HUD, ADS laser, defence prep, eliminated panel, round summary, match end, shooting range, desktop ADS |

**Not verified**
- **No real iPhone test.** Touch behaviour was emulated in desktop Chromium, so iPhone input, Safari behaviour, performance and audio unlock are all unverified.
- **Audio has never been listened to.** I couldn't hear anything in this environment; the sounds are designed in code and not ear-tested.
- **Balance is untested by humans.** Win rates and how difficult the bots feel need your playtest.

## Known gaps and honest notes

- **Feel is untested on a real phone.** The new control layout, button sizes, aim-assist strength and camera zoom were judged from desktop emulation only.
- **Operators:** still only Ram and Hinge have signature gadgets. The four recruits are selectable but only carry the side-standard tools. The other ten designed operators show as locked.
- **Drone phase:** drones drive at a fixed speed with no jump or boost, and the camera is the same top-down view with a drone-cam overlay (no first-person cam, by design). Defenders have no anti-drone gadget yet beyond shooting.
- **Situations** are two single rounds, not scripted challenges with goals and star ratings.
- **Takeover** stays (it's the design's rule), so death isn't the end of your round as it is in Siege. That is deliberate, but say if you want a spectate-only mode.
- **Gadget poses:** there is still no Ram brace or Hinge lever animation.
- **Persistence:** only settings are saved.
- **Dev-only extras:** `window.__bc` (autopilot and speed) exists only in dev builds.

## Next steps

1. **Play the new build on your iPhone** and tell me: is the FIRE/ADS layout reachable, is aim assist too strong or too weak, is the camera too close, and does the drone phase now feel right?
2. Depending on that: tune the controls, then add the next operator pair (the six-operator core, M3), each with a gadget, bot behaviour, counterplay and tests.
3. Scripted situations with goals, and a low-effects mode measured on the device.
