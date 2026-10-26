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
