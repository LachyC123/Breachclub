// Who the AI should treat as one of its own. A player handed to the development autopilot is
// driven by bot logic, so planning, planting and escorting must count it as a bot, not a player.
import type { Actor } from '../sim/types';

const autopiloted = new WeakSet<Actor>();

export function setAutopilot(a: Actor, on: boolean) {
  if (on) autopiloted.add(a);
  else autopiloted.delete(a);
}

/** Driven by AI this tick: a bot, or an autopiloted player. */
export const aiDriven = (a: Actor) => a.controller === 'bot' || autopiloted.has(a);

/** A real person at the controls. */
export const playerDriven = (a: Actor) => a.controller === 'human' && !autopiloted.has(a);
