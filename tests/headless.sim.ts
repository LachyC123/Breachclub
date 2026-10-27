import { it } from 'vitest';
import { World } from '../src/sim/world';
import { AIDirector } from '../src/ai/brain';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

it('headless bot match log', () => {
  const seeds = (env.SEEDS ?? '1,2,3').split(',').map(Number);
  const verbose = !!env.VERBOSE;
  const tally = { att: 0, def: 0, reasons: {} as Record<string, number>, durations: [] as number[], kills: 0, tags: 0, droneKills: 0 };
  for (const seed of seeds)
    for (const attackTeam of [0, 1] as const) {
      const w = new World({ seed, attackTeam, squads: [attackTeam === 0 ? ['ram', 'recruit_mo', 'recruit_tess'] : ['hinge', 'recruit_dex', 'recruit_june'], attackTeam === 0 ? ['hinge', 'recruit_dex', 'recruit_june'] : ['ram', 'recruit_mo', 'recruit_tess']], humanIndex: -1, attackEntry: ['front', 'window', 'rear'][seed % 3], difficulty: (env.DIFF as 'club') ?? 'club' });
      const ai = new AIDirector(w);
      const log: string[] = [];
      while (w.phase !== 'ended' && w.tick < 60 * 200) {
        w.step(ai.think());
        for (const e of w.events) {
          if (e.type === 'tagged') tally.tags++;
          if (e.type === 'droneDestroyed') tally.droneKills++;
          if (e.type === 'death') tally.kills++;
          if (['death', 'wallBreached', 'armed', 'sledLaunched', 'roundEnded', 'phase', 'chargePlanted', 'barricadeBroken', 'droneDestroyed', 'hingeRotateStart'].includes(e.type)) {
            const t = (w.tick / 60).toFixed(1);
            let extra = JSON.stringify(e).slice(0, 120);
            if (e.type === 'death') {
              const v = w.actor(e.actorId)!;
              const k = w.actor(e.killerId);
              extra = `death ${v.name}@(${v.pos.x.toFixed(1)},${v.pos.y.toFixed(1)}) by ${k?.name}@(${k?.pos.x.toFixed(1)},${k?.pos.y.toFixed(1)})`;
            }
            log.push(`${t} ${extra}`);
          }
        }
        if (verbose && w.tick % 300 === 0) log.push(`  @${(w.tick / 60).toFixed(0)} ` + w.actors.map((a) => `${a.name}${a.alive ? '' : '✝'}(${a.pos.x.toFixed(1)},${a.pos.y.toFixed(1)}) ${ai.bots.get(a.id)!.task.kind}/${ai.bots.get(a.id)!.status}`).join(' | '));
      }
      const r = w.result;
      if (r) {
        if (r.winner === w.attackTeam) tally.att++;
        else tally.def++;
        tally.reasons[r.reason] = (tally.reasons[r.reason] ?? 0) + 1;
        tally.durations.push(Math.round(w.tick / 60));
      }
      console.log(`=== seed ${seed} attackTeam ${attackTeam} entry ${w.cfg.attackEntry} result ${JSON.stringify(w.result)}\n` + log.join('\n'));
    }
  console.log('TALLY', JSON.stringify(tally));
}, 300000);
