# BREACH CLUB

A 2D top-down pixel-art squad breaching game for mobile browsers. You play 3v3 against bots on attack and defence. Operators are distinct because of what their gadgets do to the room.

This is the **first playable slice** (milestones M0–M2, plus a feedback pass for a tactical-shooter feel): one map (Spin Cycle laundrette), two signature operators (Ram, Hinge) and four temporary basic squadmates. Rounds run on the full rules. The design pack this is built from is in [`docs/`](docs/) ([`docs/00_PACK_README.md`](docs/00_PACK_README.md) explains the pack). Build status, evidence and known gaps are in [`PROGRESS.md`](PROGRESS.md).

## Run it

Requires Node 20+ (tested with Node 22).

```bash
npm install          # exact versions pinned in package.json / package-lock.json
npm run dev          # http://localhost:5173 (also exposed on your LAN for phone testing)
```

To try it on your phone, run `npm run dev` on a computer on the same Wi‑Fi. Open the "Network" URL Vite prints, then turn the phone sideways.

```bash
npm run build        # type-check + production bundle in dist/
npm run preview      # serve the production bundle
npm test             # simulation acceptance tests (vitest)
npm run sim          # long headless bot-vs-bot rounds with event logs
npm run validate     # design-pack fixture validator
```

## Flow

The main menu has four tabs:
- **PLAY:** Quick Match (first to 2) or Standard (first to 3), plus a bot difficulty and starting-side choice.
- **OPERATORS:** the roster.
- **TRAINING:** Shooting Range and two single-round situations.
- **SETTINGS.**

A match runs:
1. Loading screen.
2. Each round: pick your operator and primary weapon (teammates take the rest).
3. Attackers choose a spawn on the map overview.
4. Preparation: attackers are on drone cams, defenders fortify.
5. Action.
6. Round summary with scoreboard and MVP.
7. Match results.

## Controls

| | Touch (landscape, CODM-style) | Keyboard + mouse |
|---|---|---|
| Move | Drag on the left side (floating stick) | W A S D |
| Aim | Drag on the right side. This aims only; it never fires. | Mouse |
| Fire | Hold the big **FIRE** button. Drag your thumb off it to steer your aim while firing. | Hold left button |
| Aim down sights | **ADS** toggle: the camera pulls out for a wider view and looks further ahead; slower movement, tighter spread | Hold right button or Shift |
| Gadget | **GADGET** button (see below) | Hold **Q** to preview, release to commit, tap **Q** for the second action. Esc cancels. |
| Interact | Hold **INTERACT**. It appears only when something is in reach: Arm, Shut Off, Breach, Reinforce, Barricade, Remove, Vault. | Hold **E** |
| Reload | **RELOAD** | **R** |
| Drone (attack prep) | Left stick drives, **TAG** pings every defender in view, **NEXT CAM** cycles squad drones | W A S D, **F** tag, **N** or Space next cam |
| Scoreboard / orders | Top-left buttons | **Tab** / **C** |
| Pause | Top-left pause. The game also pauses on app switch or portrait. | **Esc** |

A laser sight runs from your muzzle to the first thing that blocks it, and turns red when it lies on a visible enemy. Hits show a white marker; kills show a red one.

**Ram (attack): bumper sled**
- Hold GADGET and drag to aim. A dotted route shows where the sled goes: an amber ring marks the panel it will break, a red X marks a hard stop.
- Release to launch.
- Tap GADGET again to brake. The sled unfolds into a shield that protects both teams.

**Hinge (defence): pivot wall**
- Hold GADGET and drag to place the wall.
- Tap GADGET to swing it 90°. The whole swing must be clear; if it isn't, it refuses, says why, and uses no cooldown.

**Prep (attack):** every attacker has two recon drones. They see through open doors but never through walls, and one bullet destroys one. When a drone dies, your spare deploys. Tags last 5 s and show as red diamonds.

**Prep (defence):** stand at a dashed wall panel and hold INTERACT to reinforce it, or at a doorway to barricade it. Shoot drones you see.

## Rules in one breath

- Each round has 30 s of prep (20 s in Quick Match), then 120 s of action.
- Attackers hold Interact on the office console for 3 s to arm it, which starts a 30 s broadcast. Defenders hold Interact for 3 s to shut it off.
- A round ends when one team is eliminated, when the clock runs out (defenders win) or when the broadcast finishes (attackers win). The tie-breaks in `docs/02` are implemented exactly.
- When you die you see who got you. Then you take over a surviving teammate exactly as they are.
- Sides swap every round.

## Tech

TypeScript 7.0.2 · Phaser 4.2.1 (WebGL, pixel-art mode) · Vite 8.3.4 · Vitest 5.0.5.

- The simulation (`src/sim`) is renderer-free and runs at a fixed 60 Hz.
- Bots (`src/ai`) read only what they can perceive.
- Rendering (`src/render`) and UI (`src/ui`, DOM) only read simulation state and events.
- All art is original pixel art, drawn procedurally at native resolution (`src/render/art`).
- All audio is synthesized at runtime with Web Audio (`src/audio/sfx.ts`). No third-party assets, network services or API keys are used.
- A development-only art sheet is at `/dev/art.html` when `npm run dev` is running.
