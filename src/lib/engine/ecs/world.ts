/**
 * ECS world setup using miniplex.
 *
 * Provides factory for creating a fresh World<Entity> and helpers for
 * querying plot/soil entities by grid coordinates.
 */

import { World } from 'miniplex';
import type { Entity, SoilState } from './components.js';
import type { With } from 'miniplex';

export type GameWorld = World<Entity>;

export function createWorld(): GameWorld {
  return new World<Entity>();
}

/**
 * Find the plot entity at the given grid coordinates.
 * Returns undefined if no plot exists there.
 */
export function getPlotAt(
  world: GameWorld,
  row: number,
  col: number,
): With<Entity, 'plotSlot' | 'soil'> | undefined {
  const plots = world.with('plotSlot', 'soil');
  for (const plot of plots) {
    if (plot.plotSlot.row === row && plot.plotSlot.col === col) {
      return plot;
    }
  }
  return undefined;
}

/**
 * Get the soil state at a given grid position, or undefined.
 */
export function getSoilAt(
  world: GameWorld,
  row: number,
  col: number,
): SoilState | undefined {
  return getPlotAt(world, row, col)?.soil;
}

/**
 * Find all plant entities adjacent (8-cell neighborhood) to the given position.
 */
export function getAdjacentPlants(
  world: GameWorld,
  row: number,
  col: number,
): With<Entity, 'species' | 'plotSlot'>[] {
  const plants = world.with('species', 'plotSlot');
  const result: With<Entity, 'species' | 'plotSlot'>[] = [];
  for (const plant of plants) {
    const dr = Math.abs(plant.plotSlot.row - row);
    const dc = Math.abs(plant.plotSlot.col - col);
    if (dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0)) {
      result.push(plant);
    }
  }
  return result;
}
