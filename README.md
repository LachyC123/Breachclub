# BREACH CLUB

A 2D top-down pixel-art squad breaching game for mobile browsers. You play 3v3 against bots on attack and defence. Operators are distinct because of what their gadgets do to the room.

This is the **first playable slice** (milestones M0–M2): one map (Spin Cycle laundrette), two signature operators (Ram, Hinge) and four temporary basic squadmates. Rounds run on the full rules. The design pack this is built from is in [`docs/`](docs/) ([`docs/00_PACK_README.md`](docs/00_PACK_README.md) explains the pack). Build status, evidence and known gaps are in [`PROGRESS.md`](PROGRESS.md).

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

## Controls

| | Touch (landscape) | Keyboard + mouse |
|---|---|---|
| Move | Drag anywhere on the left half (floating stick) | W A S D |
| Aim + fire | Drag on the right half. You fire while dragging and stop when you let go. | Mouse aims, hold left button to fire |
| Gadget | **GADGET** button (see below) | Hold **Q** to preview, release to commit, tap **Q** for the second action. Right click or Esc cancels. |
| Interact | Hold **INTERACT**. The label changes with what's nearby: Arm, Shut Off, Breach, Reinforce, Barricade, Remove, Vault | Hold **E** |
| Reload | **Reload** | **R** |
| Squad orders | **Orders** → Follow me / Hold here / Play objective | **Tab** |
| Pause | Pause button (top right). The game also pauses when the app goes to the background or the phone turns to portrait. | **Esc** |

**Ram (attack): bumper sled**
- Hold GADGET and drag to aim. A dotted route shows where the sled goes: an amber ring marks the panel it will break, a red X marks a hard stop.
- Release to launch.
- Tap GADGET again to brake. The sled unfolds into a shield that protects both teams.

**Hinge (defence): pivot wall**
- Hold GADGET and drag to place the wall. It lies across the direction you drag.
- Tap GADGET to swing it 90°. The whole swing must be clear.
- If someone is in the way, it refuses and says why, and no cooldown is used.

**Prep (attack):** tap GADGET to drive the shared scouting puck. It can go through open doors but sees nothing through walls. If you don't drive it, a teammate scouts with it.

**Prep (defence):** stand at a dashed wall panel and hold INTERACT to reinforce it, or at a doorway to barricade it. The amber-marked doorways and the service window can never be sealed.

## Rules in one breath

- Each round has 25 s of prep, then 120 s of action.
- Attackers hold Interact on the office console for 3 s to arm it, which starts a 30 s broadcast. Defenders must hold Interact for 3 s to shut it off.
- Eliminating the other team, the clock running out (defenders win) and the broadcast finishing (attackers win) all end the round. The tie-breaks in `docs/02` are implemented exactly.
- When you die, you take over a surviving teammate exactly as they are: same health, position, ammo and gadget.
- A match is first to three round wins, and you swap sides every round. Practice plays a single round.

## Tech

TypeScript 7.0.2 · Phaser 4.2.1 (WebGL, pixel-art mode) · Vite 8.3.4 · Vitest 5.0.5.

- The simulation (`src/sim`) is renderer-free and runs at a fixed 60 Hz.
- Bots (`src/ai`) read only what they can perceive.
- Rendering (`src/render`) and UI (`src/ui`, DOM) only read simulation state and events.
- All art is original pixel art, drawn procedurally at native resolution (`src/render/art`).
- All audio is synthesized at runtime with Web Audio (`src/audio/sfx.ts`). No third-party assets, network services or API keys are used.
- A development-only art sheet is at `/dev/art.html` when `npm run dev` is running.
