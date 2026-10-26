# BREACH CLUB — Complete design

Design handoff, not a playable build. See README for setup.

# 01 — Production charter
## The fantasy
Outsmart a defended room with a tiny squad of expressive specialists, then swap sides and turn that same room into your own trap. The gratifying moment is “I created that opening,” not merely “my weapon does more damage.”

## Platform and session
Landscape mobile browser first, especially iPhone; desktop mouse/keyboard also supported. True top-down 2D sprites and tilemaps, no isometric camera or 3D models rendered through a pixel filter. Single-player local simulation, one human plus two allied bots versus three enemy bots. No matchmaking, accounts, online latency, cloud AI, or backend required for the first release.

Loop: choose a squad → prepare/scout → breach or defend → adapt and take over surviving teammates → review one useful moment → instant next round. Best of five, first to three round wins; aim for roughly 6–12 minutes per match. Quick single-round practice available. The arcade feel comes from fast decisions, generous interactions, punchy feedback, forgiving aim, and little downtime, not removing all tactical consequences.

## Three distinguishing pillars
1. Change the room. Rotating shields, cut openings, movable barricades, and route gadgets alter actual collision/navigation.
2. Trick a limited mind. Footsteps and displaced audio can fool bots, whose uncertainty is real and inspectable.
3. Your squad is your remaining lives. Death hands control to a surviving teammate with their existing health, position, ammo, and unused ability. The situation persists; there is no reset or free healing.

## Visual contract
Warm weathered commercial interiors; bold character silhouettes; chunky readable physical gadget animation. Cream/coral/teal identity, rich navy shadows, amber industrial warning details. Reject generic neon sci-fi HUDs, military photorealism, tiny indistinguishable soldiers, and excessive particles hiding enemies. Tactical information must survive reduced effects and colour-vision differences.

## First playable contract
From the title screen on a phone-sized viewport, choose attack or defence, learn one gadget by using it, prepare a site or entrance, play a full 3v3 laundrette round against responding bots, breach a soft wall, win and lose through valid rules, take over a teammate, and restart without page reload. It needs one coherent art benchmark, audible feedback, and readable HUD. Placeholder assets elsewhere must be labelled during development.

## Content plan
One map and two selectable signature operators prove the mechanics. Six operators complete the first core roster. Twelve operators and three maps are a deliberate expansion target, not a demand to ship twelve unfinished abilities. No attachments treadmill, battle pass, paid random unlocks, realistic explosive recipes, or real-world tactical instruction. This is stylised arcade fiction.

## Performance and boundaries
Target steady 60fps on the user's iPhone 16 Pro Max; offer a 30fps reduced-effects mode for lower devices. These are targets until measured. Small authored maps, bounded actors and effects, no unlimited destruction simulation. Offline installability is optional later; a browser URL does not automatically guarantee offline loading. Pause safely when hidden. Progression is local with export/import; explain browser storage limitations in settings.


---

# 02 — Match rules
## Team selection
Choose three distinct operators from the current side's roster; no duplicates. In the two-operator slice, remaining slots are explicitly temporary basic squadmates. Core ships with three attack and three defence operators. Choose the controlled starting operator; allied bots run the others. Side changes require a new side-legal squad and keep favourite presets independently. Enemy squads are assembled from unlocked-for-mode content, not necessarily the player's collection; tutorial restricts unfamiliar counters.

## Round state machine
Load → pick squad (untimed) → prep 25s → action 120s → armed objective if applicable → result 5s/skippable → next round. Both teams prepare concurrently. After a round, alternate attack/defence. First to three wins; there are no draws under the ordering below. All health, ammo, charges, cover, walls, gadgets, and positions reset each round. Match progression is committed once with a unique match ID.

## Preparation
Defenders stay inside the designated building footprint. Two team reinforcement charges and three free doorway barricades per round, shared between player and AI. At least two non-reinforceable approaches to the objective must remain. AI reserves its planned placement before spending resources; player actions take priority until the placement starts. A team reinforcement takes 1.2s; wooden barricade 0.7s. Relocating a non-damaged placement during prep refunds its resource. During action, no refund from destroying or removing it.

Attackers remain in a safe exterior staging zone and select one of three entry points. One shared scouting puck can be driven through doors and marked vents; it cannot reveal through opaque walls. The player can skip driving and assign a bot to scout. A spotted defender marker becomes a hollow last-seen marker after 1s; it never tracks unseen movement. Defender tools can destroy the puck. Prep cannot be used to damage operators or install attacker gadgets inside the building. At action start, the puck expires so it is not a second permanent surveillance system.

## Core objective: Crack the Vault
A fictional bright archive console in the site. Any attacker can hold Interact within 1.25 tiles for 3 uninterrupted seconds to arm a transmitter. Movement, damage, death, or release cancels the attempt and resets that attempt's progress; charges are not lost. While arming, no shooting or gadgets. If successfully armed, a 30s broadcast countdown replaces the action clock. Defenders can hold Interact for 3s to shut it off; same interrupt rules. Successful shutdown ends the round for defenders. Broadcast completion ends it for attackers.

Before arming: elimination of defenders wins for attackers; elimination of attackers wins for defenders; action timeout wins for defenders. Once armed: eliminating all attackers does not end the broadcast; defenders must shut it off. Eliminating all defenders wins for attackers immediately. The objective requires no carried bomb, avoiding a lost-item deadlock after takeover.

## Deterministic resolution
At a fixed-step boundary resolve damage and deaths first, then surviving actors' completed interactions, then team elimination, then timers. A killed planter cannot finish a plant that tick. A surviving shutdown completing on the broadcast's last tick beats expiry. A plant completing on the action clock's last tick enters armed state. Both teams eliminated in the same tick: defenders win if not armed, attackers win if armed. Store one immutable RoundEnded event; duplicate events must not grant rewards twice. Result UI explains the actual reason.

## Death and takeover
No downed/revive system initially. After 0.6s death feedback, present surviving teammate portraits; select one or auto-select a survivor after 1s. Briefly pause solo simulation during selection, then resume at the chosen actor's real position. Clear all held input to prevent surprise firing. No invulnerability, teleport, reload, extra gadget charges, or health refill. Old AI order is cleared for the newly controlled actor. Manual living-character swaps are disabled during action initially; allowed during prep. If nobody survives, watch the armed objective in fast spectator mode or resolve the existing elimination rule.

## First 60 seconds
First launch uses a tiny interactive tutorial rather than a full prep timer. Walk to a door, aim/fire at a target, preview Ram's sled, break a marked soft panel, enter and arm a console. Prompts fade only after successful actions. Then offer a normal attack round. Defence tutorial teaches Hinge rotation and reinforcement separately. Tutorial can be replayed or skipped without locking normal play.


---

# 03 — Operator bible

Twelve original working concepts: six core and six expansion. All have 100 HP and base movement 3 tiles/s. Different identities come from decisions and silhouettes, not superior health. Primary weapons are assigned in weapons.json; each operator may later select one balanced alternative, never universal best-in-slot upgrades.

Every ability is finite per round. Cooldown means minimum delay between uses, never free recharge. Each operator also has the side-standard tool: attack gets one soft-door/soft-wall breach charge; defence gets access to shared reinforcement/barricade pool. The basic tool must not overshadow the signature. Gadgets do not regenerate on takeover.

Values are starting hypotheses requiring phone playtesting.
## RAM — attack / core

**Bumper sled: Send moving cover through the wall, follow it, then choose where it becomes a barricade.**

**Personality:** An overenthusiastic salvage racer who treats every building as a badly designed racetrack. Friendly, impatient; apologises to furniture.

**Art direction:** Wide cropped jacket, yellow wheel backpack, swept-back hair; small squat sled silhouette.

**Touch input:** Drag Gadget to aim a short trajectory; release to launch. Tap Gadget again to brake and deploy. Hold/cancel to abandon preview.

**Rules:** A remotely directed mechanical sled drives straight up to 6 tiles at 6 tiles/s. It destroys the first soft panel or wooden barricade hit, then continues up to 2 tiles through the opening. It stops at reinforced/solid surfaces. A second tap or range expiry unfolds 1.5-tile-wide cover with 120 HP for up to 12s. A hit on an enemy causes 20 damage and a short 0.5-tile shove once, never repeated contact ticks.

**Limits and failure:** One charge; launch wind-up 0.35s. Front cover protects both teams equally; side flanks stay open. The sled never curves or breaches reinforcement. Deploy only at a clearance-valid location, otherwise stop without unfolded cover.

**Counterplay:** Shoot the sled (60 HP), sidestep, place Stitch in its route, or rotate Hinge across its lane.

**Bot use:** Seek a soft edge offering a shorter path or safe site entry. Preview friendly collision; use lane reservation. Brake just beyond a breach, not in a teammate.

**Animation/audio:** Wheel spin → metal thud → tumbling pixel plaster → spring-loaded unfolding shield. A dotted route clearly ends at hard walls.

**Clever use:** Echo pulls a guard towards one entrance while Ram makes another. Spool can reach the opening quickly once the sled has stopped.

**Acceptance test:** Sled breaches one soft wall; sight, projectiles, and nav agree on the opening; reinforced wall stops it. Two actors contacting it get at most one hit each.

**Budget:** 1 charge(s), 0s minimum cooldown.

## SPOOL — attack / core

**Ribbon runway: Draw a route that lets you slide into or out of danger with momentum.**

**Personality:** A cheerful courier who plans routes in her head and gets offended by inconvenient furniture.

**Art direction:** Long coral scarf, roller-shaped boots, large waist reel.

**Touch input:** Drag Gadget from your feet in an aim direction to lay a straight strip; tap the on-strip Slide contextual button to commit.

**Rules:** Lays a 6-tile physical strip along currently traversable ground for 14s, ending at walls. Anyone entering may slide along its axis at 6 tiles/s for up to 0.8s. Player chooses either direction. Weapon is lowered during sliding and recovers 0.2s afterwards. Slide ends early at a collision with a 0.15s recovery; no wall clipping or contact damage.

**Limits and failure:** Two strips per round, 2s placement cooldown; at most two active. No invulnerability and no automatic slide when walking onto it. No direction changes during a slide. The strip cannot bridge a closed wall or unbroken door.

**Counterplay:** Enemies can use the same strip. Shoot the exposed start reel (40 HP) to remove it. Stitch grabs a sliding character and cancels motion.

**Bot use:** Place from safe cover towards a legal nearby cover point. Slide only if destination is clear and health/pressure makes it sensible; do not blindly dive into known crossfire.

**Animation/audio:** Tape unfurls tile by tile, animated arrow pulses show both available directions; boot sparks and scarf trail reinforce speed.

**Clever use:** Ram makes the opening, then Spool lays the strip through it. Hush can reduce the sound of a risky approach, but not its visible trail.

**Acceptance test:** Sliding into a newly closed Hinge stops safely; enemy use works; destroyed reel removes strip and leaves actors on valid ground.

**Budget:** 2 charge(s), 2s minimum cooldown.

## ECHO — attack / core

**Footstep puppet: Make a defender turn towards a convincing performance, then exploit the gap.**

**Personality:** A deadpan street sound artist who has a very serious opinion about squeaky shoes.

**Art direction:** Oversized headphones, short blue coat, little walking speaker with antenna ears.

**Touch input:** Drag Gadget to send a small puppet along a visible ground path up to 7 tiles. Tap again to play a short noisy performance at its position.

**Rules:** A 30 HP visible wheeled puppet follows a navigation-valid route, producing synthetic footstep events identical in category to real steps. A second tap plays a 1.5s burst of fictional reload/weapon handling sounds. No real damage, bullets, muzzle flash, enemy outline, or vision is created. Lasts 10s or until destroyed.

**Limits and failure:** Two charges, 2s cooldown, one active puppet. Replacing an active puppet requires recall confirmation and consumes the next charge. It cannot pass solid walls; route preview follows doors, not a straight ray through obstacles.

**Counterplay:** Seeing the puppet lets bots classify that source as a decoy; they can warn allies. Repeated noise from an identified source lowers its credibility. Destroy it or watch the unguarded alternate entrance.

**Bot use:** Choose routes offset from squad entry; emit during teammate movement. Defenders update suspicion rather than running directly into predictable deaths.

**Animation/audio:** Little feet animation, distinctive speaker cone recoil, friendly-only route preview. Sound markers look like ordinary uncertain sounds to opponents.

**Clever use:** Ram breaches while an uncertain guard investigates the puppet. Relay can accidentally displace the puppet noise, making the trick fail or take a surprising route.

**Acceptance test:** Unseen bot investigates sound without learning player position; direct sight identifies the puppet; nearby allies share only that identification.

**Budget:** 2 charge(s), 2s minimum cooldown.

## HINGE — defence / core

**Pivot wall: Rotate your cover to expose one angle and close another at exactly the right moment.**

**Personality:** A theatrical furniture designer who insists combat is mostly a room-layout problem.

**Art direction:** Tall violet apron-coat, square shoulder pad, folding door carried vertically.

**Touch input:** Tap valid floor socket and choose horizontal/vertical preview; Place. While within 6 tiles, tap Gadget to rotate the selected wall 90 degrees.

**Rules:** Creates a 2-tile-wide freestanding opaque bullet-blocking wall, 160 HP, rotating around a fixed centre in 0.6s. Rotation has a 0.25s visible warning. The entire swept footprint must be clear of actors and structural walls; otherwise rotation fails with a reason and no cooldown. Wall blocks shots/sight according to its current authoritative shape; navigation uses conservative swept occupancy while turning.

**Limits and failure:** One wall, reusable rotate on 4s cooldown. It cannot occupy protected route cells, console footprint, spawn, or another gadget. No crushing or shoving actors. Destroyed wall is gone for the round.

**Counterplay:** Shoot it down, use Ram to deal 60 impact damage (stops the sled), jam electronics with Jolt, or approach the angle it exposes.

**Bot use:** Place to cover a site angle while preserving escape. Rotate only if it improves threatened cover and does not cut teammate line of fire.

**Animation/audio:** Large physical pivot, painted arrow sweep, ratchet sound, failed preview highlights obstructing cell without revealing hidden enemy identity.

**Clever use:** Stitch can punish the route opened by rotation. Relay can tempt an attacker to look behind the wall before Hinge swings away.

**Acceptance test:** Try rotation with a body in its swept footprint; it refuses without clipping or damage; after clearance rotates and updates sight/nav.

**Budget:** 1 charge(s), 4s minimum cooldown.

## STITCH — defence / core

**Snapline: Turn a doorway into a temporary capture point, then decide whether to contest or retreat.**

**Personality:** A meticulous stage-rigger who is warm off duty and impossible to hurry.

**Art direction:** Cream utility overalls, crimson cable spool on one shoulder, asymmetrical glove.

**Touch input:** Drag between two nearby valid anchors; automatic snapping shows legal pairs. Confirm with one tap.

**Rules:** A visible thin cable spans up to 3 tiles of open ground. Enemy crossing triggers a 0.3s tightening warning, then holds movement for up to 0.9s. Victim can aim and shoot normally, and immediately break either 20 HP anchor. No damage. One trigger consumes the line. Friendly crossing does not trigger it.

**Limits and failure:** Two lines, 1s placement cooldown. No stacking triggers within 2 tiles; movement-control immunity lasts 2s after release. Line is low contrast at distance but visibly glints at close range; never invisible.

**Counterplay:** Shoot anchors, destroy with Ram (stops sled but consumes cable), or disable with Jolt before crossing. Spool is not immune.

**Bot use:** Use one entry with nearby cover; never place both lines across the same doorway. After trigger, peek if safe rather than charging the victim.

**Animation/audio:** Cable flex, brief tension arc, clear Break Anchor icon for victim; restrained character plants feet and raises gun.

**Clever use:** Hinge changes approach angles into a line. Magnet may move loose cover nearby, but does not move anchors.

**Acceptance test:** Triggered victim can fire, receives no damage, escapes by shooting anchor, and cannot be chain-rooted inside immunity window.

**Budget:** 2 charge(s), 1s minimum cooldown.

## MAGNET — defence / core

**Scrap winch: Rearrange loose cover during the firefight and steal a useful shield from a doorway.**

**Personality:** An elderly scrapyard tinkerer delighted when someone finally notices her invention.

**Art direction:** Round goggles, mint coat, heavy horseshoe-shaped pack, compact stance.

**Touch input:** Aim Gadget at a highlighted movable prop within 5 tiles, then tap a valid destination within 2 tiles of that prop.

**Rules:** Pulls one tagged loose cover object in a straight swept path to the destination over 0.8s after a 0.3s tell. Eligible: authored movable cabinets/crates and Ram deployed shields. It cannot move actors, structural walls, Hinge walls, objective, traps, or mission props. Object retains HP and owner-neutral protection.

**Limits and failure:** Three uses, 4s cooldown. Both target and destination require current direct line of sight from Magnet; destination must preserve mandatory routes. Moving path cannot cross actors; blocked motion stops at last safe point and consumes the committed use.

**Counterplay:** Shoot the 50 HP winch tether origin during wind-up to interrupt; charge is spent once motion starts. Move to flank; Jolt cancels pending electronic movement.

**Bot use:** Choose cover that opens a useful firing angle or blocks a dangerous angle without fully sealing the site. Score planned friendly paths.

**Animation/audio:** Coiled cable stretches, scraping floor sparks, cabinet visibly slides; ghost target and bounding footprint are shown before commit.

**Clever use:** Steal Ram cover to expose its user; turn a familiar room layout into something different. Hinge and Magnet cannot target each other’s fixed foundations.

**Acceptance test:** Ram shield moves with HP preserved; cabinet refuses to cross an actor; no illegal map closure or hidden target selection.

**Budget:** 3 charge(s), 4s minimum cooldown.

## JOLT — attack / expansion

**Arc link: Draw a temporary line of interference through a room to switch off a chosen defence.**

**Personality:** A playful repair technician who claims everything is improved by briefly turning it off.

**Art direction:** Orange insulated sleeves, angular split-prong wrist tool.

**Touch input:** Drag from yourself towards a visible electronic device; release after a 0.4s lock preview.

**Rules:** Applies a 3s disable to one electronic gadget within 5 tiles and clear line of sight. A second eligible device within 2 tiles of the first is also disabled if the connecting ray is unobstructed. Hinge cannot rotate; Relay cannot relocate sound; Lumen goes dark; pending Magnet motion cancels safely; Stitch electronics cannot trigger. No damage or health stun.

**Limits and failure:** Two charges, 3s cooldown. Mechanical cover stays solid; already triggered Stitch restraint releases. Cannot target enemies as primary targets. Disable durations refresh rather than add.

**Counterplay:** Keep devices separated, break sightline, shoot Jolt during lock (cancels without spending), or use mechanical cover.

**Bot use:** Choose a threatening active device and avoid wasting on disabled targets; cross the opened tactical window with teammates.

**Animation/audio:** Branching chunky electric line for 0.2s, readable crossed-bolt icon and countdown on disabled gadget.

**Clever use:** Free a trapped Spool; freeze Hinge’s orientation before Ram advances.

**Acceptance test:** Two unobstructed close devices disable; a third never chains; wall blocks chain; Hinge remains a physical obstacle.

**Budget:** 2 charge(s), 3s minimum cooldown.

## HUSH — attack / expansion

**Quiet bubble: Trade information tools for a short, coordinated quiet approach.**

**Personality:** An unflappable drummer whose quietest moments make everyone nervous.

**Art direction:** Dark teal poncho, rounded drum case, soft broad boots.

**Touch input:** Tap Gadget for a moving radius around Hush; no aim mode.

**Rules:** For 6s within 2.5 tiles, allied footsteps produce half normal hearing radius; reload sounds are suppressed. Gunfire, destruction, alarms, and objective sounds remain unchanged. No enemy invisibility or removal of line of sight. Friendly HUD indicates inclusion; bots follow only on an explicit group order.

**Limits and failure:** One use; Hush cannot use secondary breach tool while active but may fire. Leaving radius restores ordinary sound immediately.

**Counterplay:** Visual watch, Lumen light curtains, exposed approaches, and loud defensive alarms still work.

**Bot use:** Use during approach when at least one ally can benefit, never while already in an active firefight.

**Animation/audio:** Subtle ripple ring, cloth movement, muted shoe transients; no full-screen filter or silence for critical sounds.

**Clever use:** Quiet Spool repositioning remains visible; Echo can create a louder distraction elsewhere.

**Acceptance test:** Gunfire remains audible inside field; footsteps outside radius use normal range; perception does not receive true position magically.

**Budget:** 1 charge(s), 0s minimum cooldown.

## CHISEL — attack / expansion

**Cutout frame: Choose between a small scouting window and a committed new route.**

**Personality:** A precise mural artist who sees every wall as an unfinished composition.

**Art direction:** Turquoise half-cape, square eye visor, oversized chalk marker tool.

**Touch input:** Tap a marked cuttable soft segment. Preview small window; tap again to enlarge into a doorway after the initial cut.

**Rules:** First 0.8s action makes a one-tile-wide shot/sight window while retaining movement collision. A second 1.2s interaction spends the second charge and converts it to a 2-tile-wide passage if adjacent segment is also soft and free. Window mode gives a new line, passage mode gives a route.

**Limits and failure:** Two cut charges; cannot cut reinforced/solid walls. Work is loud and interrupts on damage/movement; charge spent only on completed cut. No arbitrary freehand geometry.

**Counterplay:** Watch the noisy cut location, reinforce eligible panels during prep, or use Hinge to mask the new angle. The new opening benefits both teams.

**Bot use:** Cut only where an authored tactical opening tag exists; use window to observe, enlarge if team path improves.

**Animation/audio:** Chalk rectangle → tile-by-tile cut → panel drops; window rim clearly shows bullets pass but bodies do not.

**Clever use:** Jolt disables a defence visible through a window; Ram can turn a window segment into a full breach.

**Acceptance test:** Window permits shots/sight but blocks movement; enlargement updates all three systems; interrupted cut neither spends nor modifies wall.

**Budget:** 2 charge(s), 0s minimum cooldown.

## RELAY — defence / expansion

**Sound switchboard: Move the apparent origin of footsteps to the wrong doorway.**

**Personality:** A charismatic radio host who enjoys telling stories with suspiciously convenient sound effects.

**Art direction:** Maroon broadcast jacket, twin antenna pins, headset microphone.

**Touch input:** Place two linked nodes with two taps; tap Gadget to enable their 8s relay window.

**Rules:** Nodes within 7 tiles form a pair. During activation, eligible hostile footsteps within 2 tiles of either node are presented/heard from the other node; original footstep source is suppressed for enemies of the mover. Friendly team hears the original with a relay icon. This changes sound perception, never physical position or vision. Real gunshots, breaches, alarms, and objective sounds are excluded.

**Limits and failure:** One pair and one activation per round; 35 HP each. If one node is destroyed or disabled the relay stops. A sound event can be remapped only once even across multiple relays.

**Counterplay:** See or destroy node, use visual observation, or Jolt. A relocated sound has a subtle static cue discoverable in training; no guaranteed knowledge of true location.

**Bot use:** Place near alternate approaches, activate when sound-bearing opponents are likely nearby; do not relocate sounds to impossible outside-map positions.

**Animation/audio:** Cable-like UI link visible only to owners, small flashing speakers, subtle static in displaced sound.

**Clever use:** Echo’s puppet footsteps can be redirected too, sometimes undoing its deception. Hinge conceals the visible node but does not transmit sound through structural isolation.

**Acceptance test:** Remapped sound delivers only destination to observer; no recursive relay; direct vision always overrides misleading audio.

**Budget:** 1 charge(s), 0s minimum cooldown.

## LUMEN — defence / expansion

**Light curtain: Create a visible detection line and choose when to hide your own movement behind glare.**

**Personality:** A cinema projectionist who treats each defensive hold like a carefully timed entrance.

**Art direction:** Cream waistcoat, magenta projector satchel, broad hat brim.

**Touch input:** Place a projector facing a snapped horizontal/vertical line. Tap Gadget to pulse glare when an enemy crosses.

**Rules:** Projects a 5-tile-long thin light line, stopped by opaque surfaces. Crossing triggers a directional chime and last-seen crossing marker, not live tracking. Once per round, projector can emit a 1s glare that blocks sight through its line for both teams while leaving projectiles/movement unaffected. It never whites out the phone display.

**Limits and failure:** One 40 HP projector; glare has 0.3s tell and one use. Crossing markers expire in 1s. No damage. Fog renderer and bot sight use the same optical obstruction.

**Counterplay:** Shoot projector, Jolt it, wait out glare, or cross elsewhere. Blind fire is possible for both teams without aim assistance.

**Bot use:** Place across a flank; use glare to reposition under pressure, not to hide the objective forever.

**Animation/audio:** Thin theatrical light stripe, dust motes within a small budget, geometric eye icon; glare is a local opaque band.

**Clever use:** Magnet rearranges cover during the short sight break. Hush cannot silence the projector’s own alarm.

**Acceptance test:** Line stops at wall, crossing marker stays at crossing location, glare denies both teams sight and auto-aim but not bullets.

**Budget:** 1 charge(s), 0s minimum cooldown.

## PATCH — defence / expansion

**Foam brace: Save a crumbling defence or rapidly close one small breach, with a choice you cannot take back.**

**Personality:** A stubborn emergency carpenter who names every repaired object and takes its destruction personally.

**Art direction:** Red work apron, foam canister backpack, large roller on belt.

**Touch input:** Aim Gadget at damaged eligible cover or a breached soft segment; preview Repair or Plug and tap to commit.

**Rules:** After 0.8s uninterrupted work, repair a cover object by 80 HP up to its original max, or create a 90 HP foam plug in one previously breached 2-tile wall segment. Plug blocks sight, shots, and movement, lasts 10s, then visibly crumbles. Cannot fill a Chisel window unless it is enlarged into a breach.

**Limits and failure:** Two uses, 3s cooldown. Plug rejected on protected approach, occupied footprint, or if it eliminates every currently open walking route to objective. No health healing, resurrection, reinforcement repair, or rebuilding destroyed Hinge.

**Counterplay:** Shoot low-HP foam, Ram breaches it, wait for expiry, or use the other route. Damage interrupts work without spending.

**Bot use:** Repair contested cover only from safe side; plug a flank only if a legal alternate route stays open.

**Animation/audio:** Foam grows from edges in readable chunks, timer cracks indicate expiry; repair shows real panel patches.

**Clever use:** Repair Ram cover after Magnet steals it; restore Hinge HP while preserving its rotation rules.

**Acceptance test:** Cannot encase an actor or fully seal site; expiry updates nav/sight/projectiles exactly once; repairs never exceed max HP.

**Budget:** 2 charge(s), 3s minimum cooldown.


---

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


---

# 05 — Mobile controls and screens
## Main controls
Landscape only initially. Left floating stick moves, right floating stick aims and fires when dragged beyond dead zone. Releasing right stick stops shooting; actor keeps last facing. Gadget button supports tap/drag as each ability specifies. Interact is a large contextual button beside Gadget, Reload a smaller but still accessible button above aim area, Orders opens a three-choice radial. Never require four fingers or simultaneous movement, aim, gadget drag, and a confirmation tap. Entering gadget aim stops fire and uses that pointer for preview; release confirms valid target, drag to Cancel cancels. Movement remains usable with the other thumb.

Large contextual icon includes a short word: Breach, Place, Rotate, Slide, Arm, Shut Off, or Vault. If multiple actions are nearby, prefer objective interaction first, selected gadget second, doorway interaction third; allow tap-and-hold to select another candidate. Do not silently arm the console when the player intended a breach. Show target highlight before commitment. Interaction radius is 1.25 tiles except explicit remote abilities.

Aim assist is a modest angular attraction towards currently visible enemies within the weapon's effective range. It never targets fog, sound markers, decoys, or enemies behind opaque cover. Start with an 8-degree cone, adjustable to off/low/standard; actual values need phone testing. Do not fire automatically because an enemy enters view. A separate optional auto-fire accessibility mode can come after the core is stable; never enable it without an explicit setting.

## HUD composition
Top centre: ATTACK / DEFEND, action clock, objective state and round score. Top left: three squad portraits with health; dead portraits stay crossed out. Top right: Pause and small map button. Bottom left movement; bottom right aim and actions. Gadget icon displays remaining charges with discrete pips, cooldown ring only when relevant, and disabled reason on tap. Ammo reads current magazine / reserve. A compact compass-like sound arc near the player shows approximate direction and type, never exact unseen position.

Keep the centre and upper-middle play area free. Support safe areas, dynamic browser chrome, and at least 667×375 CSS landscape; validate 852×393 and 932×430 as additional layouts. These are test viewports, not claims about a particular phone's exact browser dimensions. At small widths reduce ornament and move nonessential score details into pause. Minimum touch targets 48 CSS pixels, primary actions preferably 56–64. Use readable scalable UI text over crisp world sprites; do not render all text at tiny pixel-world resolution.

## Friendly orders
Tap Orders then Follow, Hold, or Breach. Hold/Breach enters target placement; tap a floor/door to confirm. Select one teammate portrait or All before issuing, default All. Bots show “Moving”, “Ready”, “Blocked”, or “Following” as short icons/status, not debug prose. A breach command has a readiness button; once required teammates arrive, player taps Go. If one cannot arrive in 3s, show reason and allow Go with available teammate or Cancel. Never freeze the round waiting indefinitely. All interaction remains unpaused during action except ordinary Pause and death selection.

## Screen flows
Title: Play, Practice, Operators, Settings. No shop overlay, energy timer, or compulsory daily login.
Play: map card, difficulty, preferred initial side, squad selection, Start.
Operator card: animated character, one-sentence ability, 8-second looping demo, strength, limitation, counters, Try button. Let a player understand a gadget without a paragraph of jargon.
Prep: site or entry map with valid placement ghosts, shared resource counters, Ready button. Ready shortens remaining prep to 3s after both AI teams complete minimum safe setup; do not force the player to wait for meaningless idle time.
Result: why the round ended, one useful event (“Your decoy drew a defender away”), next round. Summary can describe recorded events; no fabricated tactical claims.
Match end: earned XP, operator mastery progress, next unlock choice, Rematch. No compulsory reward animation longer than 2s; tap skips.
Settings: sound categories, aim assist, sensitivity, left-handed layout, reduced shake/flashes, captions, text size, quality, export/import save.

## Input edge cases
Track pointer IDs independently; pointer capture; reset on cancel, blur, rotation, app hiding, and death takeover. Touch UI must not trigger browser scrolling/pinch zoom within game surface. Portrait shows rotate message and pauses. Restore into an explicit Resume screen. An interrupted arming input cancels safely. No held trigger survives returning from another app. Desktop defaults WASD, mouse aim, left fire, E interact, R reload, Q gadget, middle/Q-drag preview alternative, Tab orders, Escape pause; keybind conflicts resolved in settings.

## Information accessibility
Team shapes and outlines accompany colours. Sound captions give uncertain direction for actual heard events; deaf players should still access meaningful tactical information. Reduced flash mode replaces large bright pulses with local impacts. Shake starts modest, and can be zero. Optional haptics only if supported; never make them necessary or promise support without testing.


---

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


---

# 07 — Bots that make the abilities worth using
## Architecture
Use deterministic local game AI, not an LLM service. Separate perception, memory, utility decisions, navigation, action execution, and animation. Behaviour reads PerceptionSnapshot, not arbitrary true enemy coordinates. Own-team locations and static known floorplan are allowed; unseen enemy actors, current hidden gadgets, and unobserved destruction are not.

Memory entries hold event/source ID, observed region, confidence, timestamp, modality and decoy classification. Current sight permits aiming at visible actors. Lost sight transitions to last-known position, then search, then original role. Noise permits investigation or cautious cover use; it never grants an aim lock. Seeing a puppet updates only that source's classification. Bot allies share sightings after a delay, with their original timestamp; messages do not refresh stale information.

## Squad roles
Defence chooses anchor, nearby support, and limited roamer. One generally holds the objective, one watches another approach, and one may investigate. Roles are preferences, not scripted immobility; the anchor can act against an armed console or immediate lethal threat. Attack chooses entry leader, cover support, and flanker. Flanker uses a different legal route when plausible, but regroups if isolated. One bot is designated planter unless the human is interacting. Reserve interact slots so three bots do not all arm the same console.

## Utility choices
Example options: return to objective, shoot visible threat, move to safe cover, respond to sound, breach useful route, use gadget, reload, retreat, follow player order, defuse. Scores consider urgency, known danger, path cost, cooldown and squad commitments. Tick strategic scoring at 5–10Hz, immediate reactions on relevant events; do not raycast everything every render frame. Repath after geometry revision and when stuck for 0.6s. Recover via alternate route; after 2s unable, abandon task and report Blocked. No teleporting to solve paths.

## Difficulty hypotheses
Rookie: reaction around 450–700ms, moderate aim error, deliberate opening for learner, minimal coordinated flank. Club: 250–450ms reaction, useful gadget timing, one sensible alternate angle. Expert: 180–320ms, better information sharing and cover discipline, coordinated breach. These intervals are tunable sampled delays; not guarantees of human fairness until tested. Health/damage/range rules remain equal. Bots cannot begin a response before a perception event reaches them. Never let expert bots see through fog or predict input.

## Gadget-specific scripts
Implement the policy in every operator's JSON/bible. Each gadget needs valid-target search, utility score, telegraph, committed execution, and abort conditions. A bot Ram must use a beneficial destructible edge, not launch at any opponent. A bot Hinge must evaluate its swept footprint. A bot Echo needs a plausible distraction while squad moves. A bot Stitch must guard one route without stacking. A bot Magnet must predict clearance and prevent sealing the site. Expansion gadgets require the same depth; no fake activation for show.

## Friendly reliability
Human orders override ordinary utility but not inability or immediate self-preservation. A follower can take nearby cover, must stay within reasonable regroup distance, and never repeatedly stand in the human's aim path. Reserve left/right entry positions. Display a compact ready cue before a coordinated breach. Bots can use their own signature abilities; the player can disable automatic gadget use per teammate in squad setup, allowing the gadget to remain for takeover.

## Fairness test scenes
Place a stationary hidden player behind a wall; bot must neither aim-track nor hunt them without perception. Generate footsteps on another route and inspect search region. Play an Echo puppet unseen then visible; bot suspicion must change. Activate Relay and assert the receiving bot gets the displaced region only. Breach a wall and confirm newly acquired sight begins after geometry changes. Destroy an objective path and confirm repath. Run all tests at multiple seeded timings, not just one cinematic setup.

Match telemetry records shots, hits, perception events, gadget actions, path failures, objective attempts, takeover, and round reason. Debug overlays may show true positions only in development and must be excluded from release. Use telemetry to find frustration; do not optimise purely for maximum bot win rate.


---

# 08 — Maps built for clever play
## General layout contract
Authored maps, not procedural random rooms, for the first release. A compact 36×28-tile building/exterior footprint is the starting target; use 16px world tiles and tune camera view on phone before detailing. Six to nine meaningful spaces. Every objective has two protected walking approaches that cannot be reinforced or plugged, plus at least one destructible opportunity. No exterior spawn sightline directly to objective or enemy starting position. No long unbroken corridor dominating the map.

maps.json is a room adjacency design graph, not a finished tilemap. The implementation must draw real room bounds, portals, cover, protected cells, tactical cut tags, clearance, spawn polygons, and collision. Graph connectivity alone does not establish physical playability. Use the graph for a macro check, then test the actual layout with actor-sized movement.

## Spin Cycle — first map
A rain-soaked laundrette, cream tiles, coral signs, turquoise machines, a warm office behind grimy glass. Street at south, shop central, service corridor west, office northwest, stockroom northeast, alley wrapping east/north. Machine rows break shop sightlines without becoming a repetitive maze. A hanging OPEN sign, round washer doors, and a desk lamp mark different areas.

Primary attack: street → shop → service → office. Alternate: street → alley → stock → office. Breach opportunity: shop soft partition into stock. Optional vault: alley → service. The office/stock and service/office entrances remain non-reinforceable and non-pluggable. Defenders can protect surrounding angles but cannot block both entrances physically. The protected rule must be visible in placement preview as “Keep approach open.”

Three entry selections: front doors at street, side service window, rear stock door reached from alley. Only two exterior region IDs are needed; entry selectors are distinct authored points inside those regions. Attackers cannot spawn in a defender sightline. Office contains console with one readable lamp landmark, a desk offset from centre and two approach sightlines. Place two movable laundry carts/cabinets for Magnet; do not make every washing machine movable.

Teach Ram at shop/stock, Hinge at office approaches, Spool along a short broken sightline, Echo via service, Stitch at a visible narrow turn, Magnet with a movable cart. No obligatory trick shot or single required specialist.

## Last Orders — expansion
Closed noodle diner with red booths, jade counter, brass kitchen surfaces, delivery crates, steaming signs outside. Dining and kitchen create two distinct fight rhythms: booth pockets versus narrow but looped service paths. Objective is a small manager office joined to dining and pantry. Large diner window is cosmetic unless an explicit vault link is authored. Movable food carts offer Magnet routes. Keep booth props below visual clutter threshold. The lesson is rotating cover and creating new angles without a single dominant choke.

## After Hours — expansion
Small art-restoration gallery with tall painted partitions, cool terrazzo, orange workshop lamps, enclosed archive objective and courtyard loop. Gallery-to-workshop soft segments support Chisel. Courtyard window permits a risky alternate entry. Hinge cannot rotate into large sculptures; use clear floor patterns to communicate footprint. Movable display crates are visually distinct from fixed sculpture plinths. The lesson is information warfare: Echo, Relay and Lumen work around loops, with clear visual landmarks to reorient.

## Validation
For each tilemap: flood fill walking clearance from each spawn to objective under all legal reinforcement presets; prove two protected approaches survive. Inspect after all soft panels destroyed, both Hinge orientations, Patch plugs, moved covers, and sliding. Assert no placement can fully seal required access. Measure travel times with real controller. Test at smallest mobile viewport; enemy silhouette must stay discernible behind set dressing. Each map gets attack/defend player playthroughs plus seeded bot matches. A rendered floorplan is not proof of a fair map.


---

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


---

# 10 — Progression without breaking tactics
The reward should be new decisions, character attachment, and mastery, not a health/stat grind that makes bots obsolete. All six core operators are available after the optional tutorial. Do not lock the counter necessary to finish an introductory scenario. Expansion operators unlock by choosing contracts, not random loot boxes.

Account XP: proposed 100 per completed match plus 25 for a win; abandoned rounds give no match reward. Tutorial grants a one-time 100. This is a pacing hypothesis. Level threshold starts at 200 + 50×(current level−1) XP for the next level. Store earned XP, not only level; derive progress from the formula. No energy, streak punishment, premium currency, daily requirement, or real money system in initial release.

Each completed match also advances one selected expansion contract by one. Three completions unlock that chosen operator; loss still counts. Six expansion operators therefore require at most eighteen completed matches when focusing contracts. Before unlock, every operator is playable in an isolated Try room with its counters demonstrated. Challenges are optional bonus cosmetics rather than mandatory trick-shot gates.

Operator mastery tracks meaningful actions: useful breach followed by teammate traversal; decoy investigation; safe ally relocation; trap escape counterplay; objective defence; successful device disable. Award each event type a bounded number per round to prevent farming your own stationary gadget. Do not award indefinite mastery for shooting and repairing the same cover. Mastery rewards portrait frames, outfit colourways preserving team readability, gadget decals, victory poses, and short lore cards. No upgraded stun duration, extra gadget charges, stronger wall HP, or damage bonuses.

Practice modes: weapon range, operator Try room, single round with side/map/difficulty selector. Core content can later include authored challenge cards: breach without casualties, win with no reinforcement, complete a coordinated entry. Daily rotation is optional local seeded content and must never require server time or prevent playing an old favourite.

Result screen celebrates actual events with clear numbers. Save match ID with the reward transaction so reload cannot grant the same XP twice. Local single-player saves are user-owned; anti-cheat infrastructure is unnecessary. Provide export/import and reset confirmation. No account creation or network required to view progression after initial assets load.


---

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


---

# 12 — Build and review sequence
## M0: inspect and establish identity
Audit repo and dependencies, preserve existing work, create PROGRESS.md, establish launch command and content validation. Produce one visual benchmark laundrette room with appropriate operator scale and mobile HUD. Choose original/licensed assets and record licence evidence. Graybox topology and prototype aim-stick feel. Exit: clear coherent target image from the actual renderer, readable phone scale, no broken launch. Do not spend weeks on all twelve portraits first.

## M1: first complete mechanical loop
One laundrette, 3v3 basic weapon bots, movement/aim/fire/reload, objective, prep tools, wall destruction, fog, sound, pause, death takeover, win/loss and restart. Ram and Hinge signature mechanics may initially use explicit prototype art, but must genuinely alter space. Enemy and friendly bots use them through the same validation. Exit: ordinary input completes attack and defence rounds; hidden enemies cannot be targeted; destructible opening is traversable; no stuck restart.

## M2: first playable review
Replace the slice's obvious placeholder art, add distinct Ram/Hinge animation, mobile menu flow, sound mix, contextual UI, impact effects and tutorial. Test on phone if available; label emulation if not. Capture active-play shots and a short interaction recording when tools allow. Give user a playable local/development build and focused question about feel, not a request to approve an unfinished design. Review before expanding scope.

## M3: six-operator core
Add Spool, Echo, Stitch, Magnet one at a time with input, art, bot use, counters and integration tests. Finish fair hearing and decoy memory. Include six Try rooms, squad presets and distinct weapon assignments. Test all core pair interactions, especially cover steal, slide-block, and decoy response. Exit: each operator produces a distinct enjoyable decision; a portrait/stat swap fails this gate.

## M4: durable mobile game
Local saves/export/import, mastery/XP, first-to-three flow, difficulty tiers, keyboard controls, pause/resume and accessibility. Run repeat rounds, all side swaps, device layout testing and measured performance. No dependency on network after optional offline capability unless explicitly implemented and verified. Exit: meaningful complete session, clean relaunch, no doubled rewards.

## M5: expansion, only after core review
Add Jolt/Chisel first to establish electronic disable and window rules; then Hush/Relay/Lumen/Patch individually. Build Last Orders and After Hours as authored maps with new tactical purpose. Introduce operator contracts and optional challenge cards. Do not call this milestone complete when expansion operators lack bot behaviours or animation. Defer any weak concept rather than silently replacing it with a grenade; discuss a better mechanical replacement.

## M6: second polish pass
Review all mobile active-play captures, repeated audio, character silhouette, muzzle flashes, wall transitions, buttons, target previews, low-health feedback, reward pacing and restarts. Profile busiest valid gadget combination. Fix top sources of confusion. Capture updated evidence after fixes. Package build and README commands, supported/unverified devices, known issues, licences, and test report. A clean compiler is insufficient proof of polished gameplay.

No promised completion dates. Estimate milestones only after repository audit and initial asset/interaction prototype. Each milestone has one integrated game, not separate unconnected mechanic demos.


---

# 13 — Acceptance and regression plan
## Truthful deliverable status
This ZIP has documentation and data validation only. No gameplay, rendering, bot quality, browser compatibility, performance, or art quality has been tested because no game exists in the pack. Claude must fill the evidence report during implementation.

## Automated simulation checks
1. Each objective outcome, including plant at timeout, shutdown at broadcast expiry, simultaneous team death, planter death on completion tick, and last defender death after arm.
2. Each signature ability's acceptance test from operators.json, plus the pairwise cases in combinations.md.
3. Wall break and foam expiry update movement, sight, bullets and nav at same revision. No one-frame shooting through intact wall or remaining invisible collider.
4. Every map and allowed setup retains reachable objective; protected entrances reject seal/plug placement.
5. Bot perception never delivers hidden target coordinates via aim, sound, stale sightings or gadget previews. Test decoy classification and nonrecursive sound relay.
6. Death takeover keeps survivor health/ammo/charges/position, clears held input and AI order, and grants no invulnerability.
7. Restart 20 times clears entities, event listeners, controls, temporary effects and round resources; entity count returns to baseline.
8. Save migration, corrupt import, interrupted transaction, duplicate reward event and page reload from round checkpoint.

## Playtest paths
Fresh launch → tutorial → attack → arm → win → defend → reinforce → lose → takeover → complete match → result → rematch. Repeat without tutorial; practice one operator; cancel an invalid gadget preview; expend last charge; reload empty; rotate a blocked wall; move cover during a bot path; pause while holding fire; resume; rotate phone; return from another app. No developer-only commands may substitute for these user flows.

## Touch checks
Move + aim simultaneously. Move + drag gadget, releasing outside button. Change fingers and cancel pointer. Tap UI near notch. Open orders while under pressure. Confirm buttons do not overlap thumb zones or hide objective. Left-handed mode mirrors controls without reversing world aim. Bigger text remains inside cards. Unsupported portrait pauses and returns cleanly. Keyboard tests cannot prove touch controls work.

## Operator enjoyment review
Ask for each character: can a new player state the gimmick after a 20-second demo? Does choosing when/where to use it change the result? Can the opponent understand and counter it? Does it combine with another system? Does it remain fun on a small touchscreen? A no means improve the design before producing more skins or characters.

## Bot acceptance
Hidden idle human is not hunted magically. Bots use cover and objective, perform useful gadget actions, do not cluster indefinitely in one door, do not ignore a safe shutdown, and respect player orders with visible failure. All three difficulties use the same world rules. Review recorded losses for an explainable cause. Automated win rate is not sufficient evidence of enjoyable opposition.

## Visual and audio gates
Inspect normal gameplay, not just menus: silhouettes, shadow/occlusion leaks, actual destruction, eight-facing animation, sprite sorting, transparency fringes, consistent pixel scale, camera shimmer, UI state, excessive flashes and quiet critical cues. Every visible gadget has start/active/end feedback. Verify audio unlock and resume. No ripped assets or unrecorded licence status.

## Performance evidence
Report actual device/browser, viewport, quality, scene, sample duration and observed frame pacing. Test at least 10 minutes including a second match, not only an empty room. Inspect long-session memory and effect cleanup. Report build/type checks, runtime errors, save checks and actual-device limitations separately. If no iPhone available, explicitly mark iPhone performance/input as unverified.

## Release blockers
Unreachable objective; omniscient bots; hidden silhouette leaks; stuck trigger; unavoidable long stun chain; unexpected purchase/login requirement; corrupt progression; signature ability represented only by generic projectile; placeholder art described as final; no working restart; UI clipped in target viewport. Fix, do not waive silently.
