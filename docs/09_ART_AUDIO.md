# 09 — Pixel-art and feedback bible
## Proper pixel art
Draw top-down characters and environments deliberately. Start at 16px tiles, 24×32px operator body frames with larger padded canvases for gadgets. Use eight facing directions, a separate upper-body aim layer if the artist can maintain coherence, and consistent foot pivot. World pixels scale with nearest-neighbour sampling; camera/subpixel motion should not cause sprite shimmer. UI may use crisp higher-resolution text and custom pixel icons. Do not create tiny 3D figures and call a post-process filter the finished art.

Palette roles: navy #202638 shadows, warm cream #F2DEB8 surfaces/highlights, coral #E96A59 action accent, teal #4BA6A0 ally accent, amber #EAB85B interaction warnings. Hostile indicators also use distinct shapes, not red alone. Operators retain varied costumes but consistent outline weight and proportions. Avoid making all attackers blue and defenders red costumes; team markers handle allegiance.

## Asset-first workflow
Before building content, inventory supplied assets and licences. None are included in this pack. Create or source one cohesive tileset, two operator sprite sheets, the two slice gadgets, impact/destruction sprites, HUD icons, and sound families. Create a visual benchmark screenshot of a live room early. If generated concept art is used, treat it as reference; clean sprites, pivots, frame continuity, transparency and atlas padding manually as required. Never claim a generated sheet is animation-ready without inspecting frames.

## Minimum animation coverage
Every operator: idle/breathe, eight-direction walk, aim/fire, recoil, reload, interact, damage, death, gadget start/use/recover. Distinct gadget props and poses are essential. Ram braces then releases; Hinge reaches for a lever and the actual wall pivots; Spool feeds a reel then leans into a slide; Echo crouches to send the puppet. Avoid twelve colour-swapped bodies all throwing the same object.

Environment: spinning washer window, rain outside, occasional sign flicker, paper flutter on breach. Ambient motion stays sparse and does not imitate enemy movement. Dead bodies cannot visually cover active trap anchors or objective controls; fade to subdued silhouettes after a short interval.

## Feedback events
WeaponFired: small muzzle flash 40–70ms, cartridge, local light splash, weapon kick, concise sound. Cosmetic light stays within visible occluded region. CoverHit: material-specific spark/chip plus brief white hit notch. WallBreached: anticipatory impact, large but brief chunks, 0.2s dust burst, visible new edge; do not keep a room opaque with dust. GadgetCommitted: character pose, clear device animation, pips decrement. InvalidPlacement: subdued thunk, clear reason, no charge use. ObjectiveArmed: distinct alarm motif and large clock shift. RoundEnded: half-second emphasis then readable reason.

Particles are pooled with a conservative starting cap around 120 visible particles and quality scaling. Important actors and danger indicators render above decorative dust. Camera shake is directional and short, starting around 1–2 world pixels for significant events; gunfire should not constantly shake the phone. The exact values must be judged in motion, not selected for screenshots.

## Sound and personality
Each operator needs a small authored voice/caption set: selection, gadget start, blocked action, ally ready, low ammo, success, failure. Keep lines brief and occasional. Example Ram: “Made a door.” Hinge: “Better floor plan.” Echo: “Wrong footsteps.” Magnet: “I'll borrow that.” No copied voice likenesses. Text captions work even before licensed/original voice audio exists; do not present silence as finished audio polish.

Audio families: gun transient/body, two material impacts, three footstep surfaces, soft breach, cover slide, pivot ratchet, cable snap, gadget success/fail, objective state, UI, music, rain. Mix critical footsteps and objective cues above music. Limit repeated simultaneous sounds and duck ambience during a breach. Unlock audio from Start tap; resume after iOS app switch. Provide separate sliders and mute.

## Review shots
Title and operator card; quiet prep; first Ram breach; Hinge rotation under pressure; teammate takeover; busy three-operator exchange; round result. Capture actual runtime states at mobile scale. Judge character identification, floor topology, clear hit state, gadget function, thumb obstruction, and visual coherence. Screenshots alone cannot verify timing or controls—also play the sequence.
