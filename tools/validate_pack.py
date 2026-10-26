"""Validate design fixtures. Does not test a game or prove balance."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
read=lambda n:json.loads((root/'data'/n).read_text())
ops=read('operators.json');maps=read('maps.json');weapons=read('weapons.json');rules=read('rules.json')
ids={o['id'] for o in ops}
assert len(ids)==len(ops)==12
for side in ['attack','defence']:
    assert sum(o['side']==side for o in ops)==6
    assert sum(o['side']==side and o['tier']=='core' for o in ops)==3
for o in ops:
    assert o['charges']>0 and o['cooldown_seconds']>=0
    for k in ['mechanic','input','counterplay','bot_policy','feedback','acceptance_test']:
        assert len(o[k])>30,(o['id'],k)
assigned=[x for w in weapons for x in w['operators']]
assert set(assigned)==ids and len(assigned)==len(ids)
for w in weapons:
    assert all(w[k]>0 for k in ['damage','pellets','interval_seconds','magazine','reload_seconds','effective_range_tiles'])
for m in maps:
    rooms=set(m['rooms']);assert m['objective'] in rooms
    adj={r:set() for r in rooms}
    for a,b,kind in m['edges']:
        assert a in rooms and b in rooms
        assert kind in ['door','open','soft','window']
        if kind in ['door','open']:adj[a].add(b);adj[b].add(a)
    for spawn in m['spawns']:
        seen={spawn};todo=[spawn]
        while todo:
            for nxt in adj[todo.pop()]-seen:seen.add(nxt);todo.append(nxt)
        assert m['objective'] in seen,(m['id'],spawn)
    assert len(m['protected_edges'])>=2
    for a,b in m['protected_edges']:
        assert b in adj[a]
        assert m['objective'] in [a,b]
assert rules['team_size']==3 and rules['wins_to_match']==3
assert rules['broadcast_seconds']>rules['shutdown_seconds']>0
assert rules['friendly_fire'] is False
assert rules['permanent_combat_upgrades'] is False
print('PASS: 12 operators; 6 core; legal weapon assignments; 3 connected room graphs; protected objective approaches; rule invariants.')
print('Not verified: physical tilemaps, gameplay, art, controls, balance, performance, or devices.')
