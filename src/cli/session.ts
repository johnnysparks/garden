/**
 * CLI game session — re-exports the shared GameSession.
 *
 * Previously this module contained a parallel implementation of the game
 * session. All game logic now lives in the shared engine (`game-session.ts`).
 * This file provides backwards-compatible type aliases and a thin factory
 * that delegates to `createGameSession`.
 */

export {
  createGameSession as createCliSession,
  type GameSession as CliSession,
  type GameSessionConfig as CliSessionConfig,
  type DuskTickResult,
  type AdvanceResult,
  type PlantInfo,
} from '../lib/engine/game-session.js';
