// Input replays ("ghosts"). The engine is deterministic, so a run is fully described by the
// input it got on every fixed step. Inputs are quantised to 1/Q so live play and replay feed
// the engine exactly the same numbers. Runs are stored run-length encoded: [[count, qx, qy], ...].
// Shared by the browser (record, draw ghosts) and the Pages Function (re-simulate to verify).
import { createGame, step, resultMs, STEP } from './engine.js';

export const Q = 16;
export const REPLAY_VERSION = 1;
export const MAX_STEPS = Math.round((5 * 60) / STEP);   // 5 minutes of play
export const MAX_RUNS = 6000;

/** Quantise a live {dx, dy} to integers in [-Q, Q] and the matching engine input. */
export function quantize({ dx, dy }) {
  const qx = Math.max(-Q, Math.min(Q, Math.round(dx * Q)));
  const qy = Math.max(-Q, Math.min(Q, Math.round(dy * Q)));
  return { qx, qy, input: { dx: qx / Q, dy: qy / Q } };
}

/** Records the input of every step that advanced the game (idle steps before the start are skipped). */
export function createRecorder() {
  const runs = [];
  return {
    push(qx, qy) {
      const last = runs[runs.length - 1];
      if (last && last[1] === qx && last[2] === qy) last[0]++;
      else runs.push([1, qx, qy]);
    },
    data() { return { v: REPLAY_VERSION, runs: runs.map((r) => r.slice()) }; },
  };
}

/** Structural check only (no simulation). Returns an error string or null. */
export function checkReplay(replay) {
  if (!replay || typeof replay !== 'object' || Array.isArray(replay)) return 'replay must be an object';
  if (replay.v !== REPLAY_VERSION) return 'unsupported replay version';
  const { runs } = replay;
  if (!Array.isArray(runs) || runs.length === 0 || runs.length > MAX_RUNS) return 'bad runs';
  let total = 0;
  for (const r of runs) {
    if (!Array.isArray(r) || r.length !== 3) return 'bad run';
    const [n, qx, qy] = r;
    if (!Number.isInteger(n) || n < 1) return 'bad run length';
    if (!Number.isInteger(qx) || !Number.isInteger(qy) || Math.abs(qx) > Q || Math.abs(qy) > Q) return 'bad input';
    total += n;
    if (total > MAX_STEPS) return 'replay too long';
  }
  return null;
}

/**
 * Re-simulates a replay. `onStep(g)` is called after every step (used to collect ghost frames).
 * Returns { finished, timeMs, steps, stars, deaths }. A run must finish exactly on its last step.
 */
export function simulate(level, replay, onStep) {
  const g = createGame(level);
  for (const [n, qx, qy] of replay.runs) {
    const input = { dx: qx / Q, dy: qy / Q };
    for (let i = 0; i < n; i++) {
      if (g.finished) return { finished: false, error: 'input after finish' };
      step(g, input);
      onStep?.(g);
    }
  }
  return { finished: g.finished, timeMs: g.finished ? resultMs(g) : null, steps: g.steps, stars: g.stars.size, deaths: g.deaths };
}

/** Positions per step for drawing a ghost: frames[2k], frames[2k+1] = x, y after step k+1. */
export function ghostFrames(level, replay) {
  if (checkReplay(replay)) return null;
  const xs = [];
  const res = simulate(level, replay, (g) => { xs.push(g.x, g.y); });
  if (!res.finished) return null;
  return { frames: Float32Array.from(xs), timeMs: res.timeMs, steps: res.steps };
}

/** Where the ghost is after `steps` steps of the live run (it waits at the start until you move). */
export function ghostAt(ghost, level, steps, spawn) {
  if (steps <= 0) return { x: spawn.x, y: spawn.y, done: false };
  const k = Math.min(steps, ghost.steps) - 1;
  return { x: ghost.frames[2 * k], y: ghost.frames[2 * k + 1], done: steps >= ghost.steps };
}
