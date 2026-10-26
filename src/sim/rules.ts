// Round state machine and deterministic resolution (docs/02_MATCH_AND_OBJECTIVES.md).
// Called after deaths and interaction completions, so ordering matches the documented tie-breaks.
import { RULES, secs } from '../content/defs';
import type { World } from './world';

export function stepRules(w: World) {
  if (w.phase === 'ended') return;
  const att = w.alive(w.attackTeam).length;
  const def = w.alive(w.defendTeam).length;

  if (w.phase === 'prep') {
    if (w.prepReadyRequested) {
      w.phaseEndTick = Math.min(w.phaseEndTick, w.tick + secs(3));
      w.prepReadyRequested = false;
    }
    if (w.tick >= w.phaseEndTick) {
      w.phase = 'action';
      w.prepConfine = null;
      w.phaseEndTick = w.tick + secs(w.cfg.actionSeconds ?? RULES.action_seconds);
      w.emit({ type: 'phase', phase: 'action' });
    }
    return;
  }

  if (w.phase === 'action') {
    if (att === 0 && def === 0) return w.endRound(w.defendTeam, 'mutual_elimination_unarmed');
    if (att === 0) return w.endRound(w.defendTeam, 'attackers_eliminated');
    if (def === 0) return w.endRound(w.attackTeam, 'defenders_eliminated');
    if (w.tick >= w.phaseEndTick) return w.endRound(w.defendTeam, 'timeout');
    return;
  }

  if (w.phase === 'armed') {
    if (att === 0 && def === 0) return w.endRound(w.attackTeam, 'mutual_elimination_armed');
    // eliminating all attackers does not end the broadcast; defenders must shut it off
    if (def === 0) return w.endRound(w.attackTeam, 'defenders_eliminated');
    if (w.tick >= w.phaseEndTick) return w.endRound(w.attackTeam, 'broadcast_complete');
  }
}

export const REASON_TEXT: Record<string, string> = {
  attackers_eliminated: 'All attackers were eliminated',
  defenders_eliminated: 'All defenders were eliminated',
  timeout: 'Time ran out before the console was armed',
  broadcast_complete: 'The broadcast finished',
  shutdown: 'The broadcast was shut off',
  mutual_elimination_unarmed: 'Both squads fell — console was never armed',
  mutual_elimination_armed: 'Both squads fell — the armed broadcast ran on',
};
