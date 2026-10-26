import { it } from 'vitest';
import { World } from '../src/sim/world';
import { AIDirector } from '../src/ai/brain';

it('headless bot match log', () => {
  const seeds = (((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEEDS) ?? '1,2,3').split(',').map(Number);
  for (const seed of seeds) for (const attackTeam of [0, 1] as const) {
    const w = new World({ seed, attackTeam, squads: [attackTeam === 0 ? ['ram', 'recruit_mo', 'recruit_tess'] : ['hinge', 'recruit_dex', 'recruit_june'], attackTeam === 0 ? ['hinge', 'recruit_dex', 'recruit_june'] : ['ram', 'recruit_mo', 'recruit_tess']], humanIndex: -1, attackEntry: ['front','window','rear'][seed % 3], difficulty: 'club' });
    const ai = new AIDirector(w);
    const log: string[] = [];
    while (w.phase !== 'ended' && w.tick < 60 * 200) {
      w.step(ai.think());
      for (const e of w.events) {
        if (['death', 'wallBreached', 'armed', 'reinforced', 'barricadePlaced', 'hingePlaced', 'sledLaunched', 'coverDeployed', 'roundEnded', 'phase', 'hingeRotateStart', 'hingeBlocked', 'gadgetInvalid', 'chargePlanted', 'interactCancel', 'barricadeBroken', 'sledStopped', 'ramWindup'].includes(e.type)) {
          const t = (w.tick / 60).toFixed(1);
          const extra = JSON.stringify(e).slice(0, 140);
          log.push(`${t} ${extra}`);
        }
      }
      if (w.tick % 600 === 0) {
        log.push(`  @${(w.tick/60).toFixed(0)} ` + w.actors.map((a) => `${a.name}${a.alive ? '' : '✝'}(${a.pos.x.toFixed(1)},${a.pos.y.toFixed(1)}) ${(ai.bots.get(a.id)!.task.kind)}/${ai.bots.get(a.id)!.status}`).join(' | '));
      }
    }
    console.log(`=== seed ${seed} attackTeam ${attackTeam} entry ${w.cfg.attackEntry} result ${JSON.stringify(w.result)}\n` + log.join('\n'));
  }
}, 120000);
