// Diagnostic (SIM=1): where and how defenders die across N bot-vs-bot rounds. N=24 by default.
import { it } from 'vitest';
import { World } from '../src/sim/world';
import { AIDirector } from '../src/ai/brain';
import { roomAt } from '../src/sim/mapdata';
import { dist } from '../src/sim/geometry';
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
it('defender deaths', () => {
  const N = Number(env.N ?? 24);
  let attW = 0, defW = 0, early = 0, outside = 0, deaths = 0, rot = 0;
  const lines: string[] = [];
  for (let seed = 1; seed <= N; seed++) {
    const attackTeam = (seed % 2) as 0 | 1;
    const sq: [string[], string[]] = attackTeam === 0 ? [['ram', 'recruit_mo', 'recruit_tess'], ['hinge', 'recruit_dex', 'recruit_june']] : [['hinge', 'recruit_dex', 'recruit_june'], ['ram', 'recruit_mo', 'recruit_tess']];
    const w = new World({ seed, attackTeam, squads: sq, humanIndex: -1, attackEntry: ['front', 'window', 'rear'][seed % 3], difficulty: 'club' });
    const ai = new AIDirector(w);
    let actionTick = -1;
    while (w.phase !== 'ended' && w.tick < 60 * 260) {
      w.step(ai.think());
      if (w.phase === 'action' && actionTick < 0) actionTick = w.tick;
      for (const e of w.events) if (e.type === 'death') {
        const a = w.actor(e.actorId)!; const k = w.actor(e.killerId);
        if (a.team !== w.defendTeam) continue;
        deaths++;
        const room = roomAt(w.map, a.pos)?.id ?? 'out';
        const st = ai.bots.get(a.id)?.status;
        const t = (w.tick - actionTick) / 60;
        if (t < 30) early++;
        if (room !== w.map.objectiveRoom) outside++;
        if (st === 'Rotating' || st === 'Moving') rot++;
        lines.push(`s${seed} t=${t.toFixed(0)} ${a.name} in ${room} status=${st} killer@${k ? dist(k.pos, a.pos).toFixed(1) : '-'}`);
      }
    }
    if (w.result?.winner === w.attackTeam) attW++; else defW++;
  }
  console.log(lines.join('\n'));
  console.log('DEF', JSON.stringify({ attW, defW, deaths, early, outside, movingWhenKilled: rot }));
});
