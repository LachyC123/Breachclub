// Match flow (first to N round wins, sides swap each round) and the fixed-step driver.
// Renderer-agnostic so it can run headless in tests.
import { secs, type Side, type WeaponDef } from '../content/defs';
import { World, type Difficulty, type RoundConfig } from '../sim/world';
import { AIDirector } from '../ai/brain';
import type { ActorIntent, TeamId } from '../sim/types';

export interface MatchConfig {
  seed: number;
  difficulty: Difficulty;
  /** side the player starts on */
  playerStartSide: 'attack' | 'defence';
  /** rounds needed to win: 1 = single situation, 2 = quick match, 3 = standard */
  winsNeeded: number;
  prepSeconds?: number;
  actionSeconds?: number;
}

/** What the player chose on the operator/spawn screens before a round. */
export interface RoundPick {
  op: string;
  weapon?: WeaponDef['id'];
  /** attacker spawn (entry point id) */
  entry?: string;
}

export interface RoundRecord {
  index: number;
  playerSide: 'attack' | 'defence';
  winner: TeamId;
  reason: string;
  highlight: string;
}

/** Each side fields three distinct operators: one signature specialist and two recruits. */
export const SIDE_SQUADS: Record<Side, string[]> = {
  attack: ['ram', 'recruit_mo', 'recruit_tess'],
  defence: ['hinge', 'recruit_dex', 'recruit_june'],
};

export class Match {
  cfg: MatchConfig;
  score: [number, number] = [0, 0];
  roundIndex = 0;
  rounds: RoundRecord[] = [];
  world!: World;
  ai!: AIDirector;
  pick: RoundPick;
  readonly matchId: string;

  constructor(cfg: MatchConfig, pick?: RoundPick) {
    this.cfg = cfg;
    this.matchId = `m${cfg.seed.toString(36)}${Date.now().toString(36)}`;
    this.pick = pick ?? this.defaultPick();
    this.startRound();
  }

  playerSide(round = this.roundIndex): 'attack' | 'defence' {
    const first = this.cfg.playerStartSide;
    return round % 2 === 0 ? first : first === 'attack' ? 'defence' : 'attack';
  }

  defaultPick(): RoundPick {
    const side = this.playerSide();
    return { op: SIDE_SQUADS[side][0], entry: 'front' };
  }

  /** (Re)build this round's world with the player's pick; score is untouched. */
  startRound(pick: RoundPick = this.pick) {
    this.pick = pick;
    const side = this.playerSide();
    const attackTeam: TeamId = side === 'attack' ? 0 : 1;
    const enemySide: Side = side === 'attack' ? 'defence' : 'attack';
    const own = SIDE_SQUADS[side].includes(pick.op) ? pick.op : SIDE_SQUADS[side][0];
    const playerSquad = [own, ...SIDE_SQUADS[side].filter((o) => o !== own)];
    const seed = (this.cfg.seed * 7919 + this.roundIndex * 104729) >>> 0;
    const entries = ['front', 'window', 'rear'];
    const entry = side === 'attack' ? (pick.entry ?? 'front') : entries[seed % 3];
    const rc: RoundConfig = {
      seed,
      attackTeam,
      squads: [playerSquad, [...SIDE_SQUADS[enemySide]]],
      humanIndex: 0,
      attackEntry: entry,
      difficulty: this.cfg.difficulty,
      prepSeconds: this.cfg.prepSeconds,
      actionSeconds: this.cfg.actionSeconds,
      humanWeapon: pick.weapon,
    };
    this.world = new World(rc);
    this.ai = new AIDirector(this.world);
  }

  /** Step one tick; returns true when the round just ended. */
  step(humanIntent: ActorIntent | null): boolean {
    const w = this.world;
    if (w.phase === 'ended') {
      w.events = [];
      return false;
    }
    const intents = this.ai.think();
    const h = w.human();
    if (h && h.alive && humanIntent) intents.set(h.id, humanIntent);
    w.step(intents);
    if (w.result && w.result.tick === w.tick) {
      this.score[w.result.winner]++;
      this.rounds.push({
        index: this.roundIndex,
        playerSide: this.playerSide(),
        winner: w.result.winner,
        reason: w.result.reason,
        highlight: '',
      });
      return true;
    }
    return false;
  }

  get matchOver(): boolean {
    return this.score[0] >= this.cfg.winsNeeded || this.score[1] >= this.cfg.winsNeeded;
  }

  /** Advance to the next round (sides swap) with a default pick until the player chooses. */
  nextRound() {
    this.roundIndex++;
    this.pick = { ...this.defaultPick(), weapon: undefined };
    this.startRound();
  }
}

/** Bounded fixed-step accumulator: never simulates minutes of missed frames after a pause. */
export class FixedStepper {
  private acc = 0;
  readonly dt = 1 / 60;
  advance(elapsedSec: number, step: () => void, maxSteps = 6): number {
    this.acc += Math.min(elapsedSec, 0.1 * (maxSteps / 6));
    let n = 0;
    while (this.acc >= this.dt && n < maxSteps) {
      step();
      this.acc -= this.dt;
      n++;
    }
    if (n >= maxSteps) this.acc = 0;
    return n;
  }
  get alpha(): number {
    return this.acc / this.dt;
  }
  reset() {
    this.acc = 0;
  }
}

export { secs };
