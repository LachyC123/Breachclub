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
