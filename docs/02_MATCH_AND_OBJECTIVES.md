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
