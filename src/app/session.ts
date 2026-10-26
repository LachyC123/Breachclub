// Match flow (best of five, side swap each round) and the fixed-step driver.
// Renderer-agnostic so it can run headless in tests.
import { RULES, secs } from '../content/defs';
import { World, type Difficulty, type RoundConfig } from '../sim/world';
import { AIDirector } from '../ai/brain';
import type { ActorIntent, TeamId } from '../sim/types';

export interface MatchConfig {
  seed: number;
  difficulty: Difficulty;
  /** side the player starts on */
  playerStartSide: 'attack' | 'defence';
  /** signature operator the player picked for each side */
  attackOperator: string;
  defenceOperator: string;
  attackEntry: string;
  /** single-round practice */
  singleRound?: boolean;
  prepSeconds?: number;
  actionSeconds?: number;
}

export interface RoundRecord {
  index: number;
  playerSide: 'attack' | 'defence';
  winner: TeamId;
  reason: string;
  highlight: string;
}

export const ATTACK_SQUAD_FILL = ['recruit_mo', 'recruit_tess'];
export const DEFENCE_SQUAD_FILL = ['recruit_dex', 'recruit_june'];

export class Match {
  cfg: MatchConfig;
  score: [number, number] = [0, 0];
  roundIndex = 0;
  rounds: RoundRecord[] = [];
  world!: World;
  ai!: AIDirector;
  readonly matchId: string;

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.matchId = `m${cfg.seed.toString(36)}${Date.now().toString(36)}`;
    this.startRound();
  }

  playerSide(round = this.roundIndex): 'attack' | 'defence' {
    const first = this.cfg.playerStartSide;
    return round % 2 === 0 ? first : first === 'attack' ? 'defence' : 'attack';
  }

  startRound() {
    const side = this.playerSide();
    const attackTeam: TeamId = side === 'attack' ? 0 : 1;
    const playerOp = side === 'attack' ? this.cfg.attackOperator : this.cfg.defenceOperator;
    const enemyOp = side === 'attack' ? 'hinge' : 'ram';
    const playerFill = side === 'attack' ? ATTACK_SQUAD_FILL : DEFENCE_SQUAD_FILL;
    const enemyFill = side === 'attack' ? DEFENCE_SQUAD_FILL : ATTACK_SQUAD_FILL;
    const seed = (this.cfg.seed * 7919 + this.roundIndex * 104729) >>> 0;
    const entries = ['front', 'window', 'rear'];
    const entry = side === 'attack' ? this.cfg.attackEntry : entries[seed % 3];
    const rc: RoundConfig = {
      seed,
      attackTeam,
      squads: [
        [playerOp, ...playerFill],
        [enemyOp, ...enemyFill],
      ],
      humanIndex: 0,
      attackEntry: entry,
      difficulty: this.cfg.difficulty,
      prepSeconds: this.cfg.prepSeconds,
      actionSeconds: this.cfg.actionSeconds,
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
    if (this.cfg.singleRound) return this.rounds.length >= 1;
    return this.score[0] >= RULES.wins_to_match || this.score[1] >= RULES.wins_to_match;
  }

  nextRound() {
    this.roundIndex++;
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
