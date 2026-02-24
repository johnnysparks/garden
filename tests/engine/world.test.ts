/**
 * Tests for ECS world helpers: getPlotAt, getSoilAt, getAdjacentPlants.
 *
 * These utility functions are used throughout the simulation systems
 * but have not had dedicated tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	createWorld,
	getPlotAt,
	getSoilAt,
	getAdjacentPlants,
	type GameWorld,
} from '../../src/lib/engine/ecs/world.js';
import { makeDefaultSoil, plantSpecies, setupSinglePlot } from './fixtures.js';

describe('createWorld', () => {
	it('creates an empty world', () => {
		const world = createWorld();
		expect(world.entities.length).toBe(0);
	});
});

describe('getPlotAt', () => {
	let world: GameWorld;

	beforeEach(() => {
		world = createWorld();
	});

	it('returns the plot entity at the given coordinates', () => {
		setupSinglePlot(world, 2, 3);
		const plot = getPlotAt(world, 2, 3);
		expect(plot).toBeDefined();
		expect(plot!.plotSlot.row).toBe(2);
		expect(plot!.plotSlot.col).toBe(3);
	});

	it('returns undefined when no plot exists at coordinates', () => {
		setupSinglePlot(world, 0, 0);
		const plot = getPlotAt(world, 5, 5);
		expect(plot).toBeUndefined();
	});

	it('returns undefined in an empty world', () => {
		const plot = getPlotAt(world, 0, 0);
		expect(plot).toBeUndefined();
	});

	it('finds the correct plot among many', () => {
		for (let r = 0; r < 3; r++) {
			for (let c = 0; c < 3; c++) {
				setupSinglePlot(world, r, c, { ph: 5.0 + r + c * 0.1 });
			}
		}

		const plot = getPlotAt(world, 1, 2);
		expect(plot).toBeDefined();
		expect(plot!.soil.ph).toBeCloseTo(5.0 + 1 + 2 * 0.1);
	});

	it('does not match entities without soil component', () => {
		// Add an entity with plotSlot but no soil
		world.add({ plotSlot: { row: 0, col: 0 } });
		const plot = getPlotAt(world, 0, 0);
		expect(plot).toBeUndefined();
	});
});

describe('getSoilAt', () => {
	let world: GameWorld;

	beforeEach(() => {
		world = createWorld();
	});

	it('returns soil state at the given coordinates', () => {
		setupSinglePlot(world, 0, 0, { ph: 7.0, nitrogen: 0.9 });
		const soil = getSoilAt(world, 0, 0);
		expect(soil).toBeDefined();
		expect(soil!.ph).toBe(7.0);
		expect(soil!.nitrogen).toBe(0.9);
	});

	it('returns undefined when no plot exists', () => {
		const soil = getSoilAt(world, 3, 3);
		expect(soil).toBeUndefined();
	});

	it('returns the full SoilState structure', () => {
		setupSinglePlot(world, 0, 0);
		const soil = getSoilAt(world, 0, 0);
		expect(soil).toBeDefined();
		// Check all expected fields exist
		expect(soil).toHaveProperty('ph');
		expect(soil).toHaveProperty('nitrogen');
		expect(soil).toHaveProperty('phosphorus');
		expect(soil).toHaveProperty('potassium');
		expect(soil).toHaveProperty('organic_matter');
		expect(soil).toHaveProperty('moisture');
		expect(soil).toHaveProperty('temperature_c');
		expect(soil).toHaveProperty('compaction');
		expect(soil).toHaveProperty('biology');
	});
});

describe('getAdjacentPlants', () => {
	let world: GameWorld;

	beforeEach(() => {
		world = createWorld();
	});

	it('finds plants in all 8 neighboring cells', () => {
		// Plant at center (1,1)
		plantSpecies(world, 'tomato_cherokee_purple', 1, 1);

		// Plant in all 8 surrounding cells
		const neighbors = [
			[0, 0], [0, 1], [0, 2],
			[1, 0],         [1, 2],
			[2, 0], [2, 1], [2, 2],
		];
		for (const [r, c] of neighbors) {
			plantSpecies(world, 'basil_genovese', r, c);
		}

		const adjacent = getAdjacentPlants(world, 1, 1);
		expect(adjacent).toHaveLength(8);
	});

	it('excludes the center cell itself', () => {
		plantSpecies(world, 'tomato_cherokee_purple', 1, 1);
		plantSpecies(world, 'basil_genovese', 1, 0);

		const adjacent = getAdjacentPlants(world, 1, 1);
		expect(adjacent).toHaveLength(1);
		expect(adjacent[0].species.speciesId).toBe('basil_genovese');
	});

	it('returns empty array when no plants are adjacent', () => {
		plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
		// Plant far away
		plantSpecies(world, 'basil_genovese', 5, 5);

		const adjacent = getAdjacentPlants(world, 0, 0);
		expect(adjacent).toHaveLength(0);
	});

	it('returns empty array for empty world', () => {
		const adjacent = getAdjacentPlants(world, 0, 0);
		expect(adjacent).toHaveLength(0);
	});

	it('does not include entities without species component', () => {
		// Add a plot entity (no species) next to the target
		setupSinglePlot(world, 0, 0);
		setupSinglePlot(world, 0, 1);

		const adjacent = getAdjacentPlants(world, 0, 0);
		expect(adjacent).toHaveLength(0);
	});

	it('includes only plants within radius 1 (not radius 2)', () => {
		plantSpecies(world, 'basil_genovese', 0, 0); // adjacent (distance 1)
		plantSpecies(world, 'basil_genovese', 0, 3); // too far (distance 2)
		plantSpecies(world, 'basil_genovese', 3, 0); // too far (distance 2)

		const adjacent = getAdjacentPlants(world, 1, 1);
		expect(adjacent).toHaveLength(1);
		expect(adjacent[0].plotSlot.row).toBe(0);
		expect(adjacent[0].plotSlot.col).toBe(0);
	});

	it('handles corner positions correctly', () => {
		// Plant at (0,0) corner — only 3 neighbors possible
		plantSpecies(world, 'basil_genovese', 0, 1);
		plantSpecies(world, 'basil_genovese', 1, 0);
		plantSpecies(world, 'basil_genovese', 1, 1);

		const adjacent = getAdjacentPlants(world, 0, 0);
		expect(adjacent).toHaveLength(3);
	});
});
