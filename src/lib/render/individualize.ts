/**
 * Per-instance visual variation.
 *
 * Each PlantInstance gets a random offset seed applied to its visual
 * params at planting time. Two tomatoes in adjacent plots look like
 * siblings, not clones.
 *
 * Uses the project's seeded RNG so variation is deterministic per instance.
 */

import type { PlantVisualParams } from '../data/types.js';
import { createRng } from '../engine/rng.js';

/**
 * Apply small random offsets to species visual params using a per-instance
 * seed. Returns a new PlantVisualParams with variation applied.
 *
 * Offsets are small enough to preserve species identity:
 * - stem curve: ±0.1
 * - stem height range: ×0.9–1.1
 * - leaf count range: ×0.85–1.15 (rounded)
 * - sway frequency: ×0.8–1.2
 */
export function individualize(
	params: PlantVisualParams,
	instanceSeed: number,
): PlantVisualParams {
	const rng = createRng(instanceSeed);

	/** Return a float in [min, max). */
	const rand = (min: number, max: number) => rng.nextFloat(min, max);

	return {
		stem: {
			...params.stem,
			curve: params.stem.curve + rand(-0.1, 0.1),
			height: [
				params.stem.height[0] * rand(0.9, 1.1),
				params.stem.height[1] * rand(0.9, 1.1),
			],
		},
		leaves: {
			...params.leaves,
			count: [
				Math.max(1, Math.round(params.leaves.count[0] * rand(0.85, 1.15))),
				Math.max(1, Math.round(params.leaves.count[1] * rand(0.85, 1.15))),
			],
		},
		flowers: params.flowers ? { ...params.flowers } : null,
		fruit: params.fruit ? { ...params.fruit } : null,
		animation: {
			...params.animation,
			sway_frequency: params.animation.sway_frequency * rand(0.8, 1.2),
		},
	};
}
