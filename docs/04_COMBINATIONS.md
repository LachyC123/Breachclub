# 04 — Combinations and rules precedence
## Why these characters are enjoyable
Each creates an action other than throwing damage: steer/stop moving cover, slide a route, impersonate movement, pivot a room, catch a crossing, relocate cover, disable a link, quiet a formation, edit wall openings, displace sound, break sight briefly, or repair a position. Every ability presents a timing or placement decision. A cool idea is not complete until the bot responds and the other side can understand what happened.

## Authored first discoveries
1. Ram + Spool: open the side wall, brake the sled beyond it, lay a runway to the new cover, slide while your bot holds the front door. Shooting is unavailable during the slide; reckless use remains punishable.
2. Echo + Ram: puppet makes a plausible approach noise. The uncertain guard rotates toward it; breach the other side. A guard who sees the puppet identifies it, so timing matters.
3. Hinge + Stitch: protect one angle, put a visible snapline on the alternative approach, rotate when pressure changes. Do not lock an enemy indefinitely; explicit restraint immunity prevents chains.
4. Magnet versus Ram: the attacker creates cover; the defender pulls it aside and changes the expected firefight. Damage/HP follow the object and both teams can use the cover.
5. Chisel + Jolt: make a small window, gain a true sightline to a projector, disable it, then decide whether to spend the last cut on a passage. A window is not a wallhack.
6. Lumen + Magnet: a brief local sight break lets a cabinet change position. The new layout is visible as soon as the glare ends. Do not teleport cover or hide its movement from simulation.
7. Patch + Magnet: move a stolen damaged shield, repair it, use it against its original owner. Repair cannot raise its original maximum HP.
8. Relay versus Echo: artificial footsteps count as footsteps, so the relay can redirect them. Source IDs prevent endless remapping. This interaction should be taught as a later challenge, not appear unexplained in the first match.

## Global interaction contract
Every entity has explicit tags: mechanical/electronic, movable/fixed, sight-blocking, bullet-blocking, movement-blocking, max HP, footprint, ownership, expiresAt. Never infer rules from colour or sprite name. Covers generally block both sides; only targeting/triggers are faction-sensitive. Gadget previews must not expose hidden enemy identity. A blocked move can say “Space occupied” but cannot paint an unseen enemy silhouette.

Electronic disable affects function, not material. Hinge remains a wall; a Stitch line cannot trigger; an active hold releases; Lumen stops emitting; Relay stops remapping. Magnet pending movement cancels at last valid position. Mechanical Ram cover, Spool, Echo, Patch foam and Chisel cuts are not electronic disable targets in this design. An Echo puppet may look electronic but is explicitly excluded to keep the counter roster bounded; explain as a mechanical playback toy in fiction.

No gadget creates an unbreakable closed site. Placement queries protect authored approach cells and check dynamic reachability before commit. No spawning objects inside actors. No force effects through walls. Commit happens once through a transaction-like action method: validate → reserve use → perform → emit event. Cancel before commit does not spend; committed motion blocked later does spend unless specified otherwise.

## Required unusual cases
- Ram hits Stitch: cable snaps, sled stops; deploy shield only if its footprint remains valid.
- Ram hits Hinge: 60 damage to Hinge; sled stops; no free penetration if Hinge breaks from this impact. A later action can use the resulting space.
- Spool hits moving cover: swept collision stops the slide at the safe boundary.
- Lumen glare: no aim assist, bot visual acquisition, or enemy silhouette across the optical band; existing last-known markers do not become current sightings.
- Jolt and Patch repair simultaneous: repair can complete on an electronic object while disabled, but does not remove disable or restore a destroyed entity.
- Two cover moves target same prop: first committed action owns its motion lease; second action rejects without spending.
- Owner death: deployed cover/traps/strips/projectors persist until normal expiry/destruction. Hush moving field ends. In-flight Ram completes its path and auto-deploys. Dead Hinge owner cannot remotely rotate; another operator cannot inherit its button.

Before adding any new gadget, update this table of rules and create at least one pairwise test with an existing operator. Do not claim all possible interactions are tested from twelve isolated gadget demos.
