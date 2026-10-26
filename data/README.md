# Design fixtures
These are valid JSON design definitions, not implementation code. operators.json contains narrative specifications plus IDs, side, tier, charge and cooldown numbers. Claude must create typed runtime schemas for actual abilities. maps.json is a room graph and requires authored tilemaps and physical validation. weapons.json assigns one starter primary per operator. rules.json centralises round hypotheses.

Use stable IDs, preserve save compatibility, and validate references. Update both canonical documentation and data when balance changes; keep a change note in PROGRESS.md. Do not claim current numbers are balanced without playtests.
