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
