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
