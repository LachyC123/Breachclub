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
