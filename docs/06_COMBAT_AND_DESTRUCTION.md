# 06 — Combat and physical space
## Responsive arcade gunplay
All operators begin at 100 HP and 3 tiles/s movement. No prone, lean, stamina, weapon durability, armour plates, or headshot multiplier in the first release. This keeps top-down silhouettes and outcomes consistent. Short-range fights should resolve in roughly 0.6–1.2s once several shots connect, giving time for a human reaction but preserving danger. Do not achieve difficulty through instant invisible one-shot hits.

Use authoritative hitscan with short visual tracers for ordinary bullets; the firing ray stops at the first blocking surface. Clear fast recoil and target reactions make it feel physical. Do not let tracers imply slow projectiles you can dodge. Damage falls outside intended close/mid range, but hits must remain explainable. No bullet penetration initially; Chisel windows are explicit openings. Attackers and defenders use the same weapon rules. No friendly fire; friendly bodies do not absorb shots, while friendly deployed cover does.

Starter weapon hypotheses: Pocket SMG 18 damage, 0.11s shot interval, 24-round mag, 1.4s reload, 6-tile effective range; Carbine 25 damage, 0.18s interval, 18 rounds, 1.6s reload, 8-tile range; Scattergun five pellets at 12 damage each, 0.65s interval, 6 shells, 1.8s reload, 3-tile ideal range. Shotgun spread is seeded, readable, never five guaranteed hits across a room. Three spare magazines or equivalent shells. No random critical hits. Tuning targets assume no headshots and do not claim actual measured average TTK.

Fire starts promptly from idle; no sprint-to-fire subsystem. Moving gently widens spread and recoil; releasing aim lowers weapon. No full-screen stun effects. Hits give brief local flinch; ordinary bullets do not cancel all player control. Death is a readable collapse, not gore clutter. Hold fire at empty magazine can trigger one automatic reload; never repeated reload loops. Manual reload preserves remaining reserve accurately.

## Surface model
Solid structure: indestructible and blocks sight, movement, bullets.
Soft panel: 100 HP, marked material, blocks all three until broken; ordinary gunfire can damage it but deliberate breaching is faster. Full destroyed segment creates at least a 2-tile opening.
Wood barricade: 40 HP across a doorway, quick to destroy.
Reinforced soft panel: invulnerable to ordinary damage in core, cannot replace all entrances. For clarity there is no mandatory hard-breacher operator; maps guarantee accessible routes. A later reinforced-wall gadget would require explicit roster/map redesign.
Window: open sight and shots, blocks walking; contextual 0.45s vault along authored landing link, interrupted before commit by collision; no invulnerability. Structural exterior boundaries cannot be vaulted.
Low cover is not a 3D height simulation: use an explicitly drawn solid crate that blocks bullets/sight according to its footprint. Never imply that crouching changes a nonexistent height system.

Every wall state transition updates collision, sight occluders, bullet raycasts, navigation, minimap explored topology, and presentation through a single geometry revision. Apply revision atomically before the next actor step. Rubble is decorative and cannot unexpectedly block the new opening. Store original map state for round reset.

## Visibility and hearing
Known floorplan may be visible in a subdued blueprint treatment. Actors, traps, dropped devices, and movable cover in unexplored rooms are hidden until observed; previously seen objects become muted last-known snapshots rather than tracking live motion. World clipping must not leak silhouettes, health bars, effects, shadows, or gadget previews through fog.

Each living team member sees within 9 tiles in all directions with hard occlusion. Shared team vision is a deliberate arcade simplification, updated from real allies. Enemy bots also share sightings with a short difficulty-dependent communication delay; neither team gets omniscience. A sound gives category, approximate bearing/region, timestamp and confidence, never exact hidden coordinates delivered to aiming. Muzzle flashes illuminate visible portions of the room briefly, but cannot reveal through walls. Tactical vision is not dependent on cosmetic brightness.

Starting sound radii: walk 4 tiles, shots 12, breach 14, reload 3. Use room-portal propagation with losses across closed doors and walls; never use raw Euclidean hearing through all concrete. Relay remaps only eligible footstep perception. No sensor event is allowed to become precise tracking.

## Movement and collision
Actor collision footprint radius 0.32 tiles. Main doors and gaps at least 2 tiles wide. Friendly soft avoidance prevents door jams while remaining inside collision; no permanent full-body ally blocking. Solid cover moves only on swept paths. On each geometry update, validate ongoing slides, vaults, bot paths, interactions, and gadget previews. Cancel invalid actions at the last safe position, not inside the new obstruction.
