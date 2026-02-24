// Procedural animation calculation layer — pure functions, no DOM, no Svelte.
// All time parameters are in milliseconds. All outputs are deterministic for
// identical inputs so the Svelte render layer can rely on referential equality.

// ── Types ───────────────────────────────────────────────────────────────────

/** Global wind simulation state. Passed between frames via updateWind. */
export interface WindState {
	/** Wind direction in radians (slowly oscillating). */
	angle: number;
	/** Wind intensity 0-1, includes gust boost when active. */
	strength: number;
	/** Milliseconds until the next gust fires. */
	gustTimer: number;
	/** Accumulated elapsed time in ms (used for sine oscillation). */
	elapsed: number;
	/** Milliseconds remaining in the active gust (0 = no gust). */
	gustRemaining: number;
}

/** Pixel offset returned by stressTremor. */
export interface TremorOffset {
	x: number;
	y: number;
}

/** Transform values returned by harvestPop. */
export interface HarvestPopResult {
	scale: number;
	opacity: number;
	y: number;
}

/** Single particle in a burst effect. */
export interface Particle {
	x: number;
	y: number;
	scale: number;
	opacity: number;
}

/** Per-plant animation configuration for the Svelte render layer. */
export interface AnimationConfig {
	swayAmplitude: number;
	swayFrequency: number;
	idleBreathing: number;
	growthSpringTension: number;
	plantMass: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Milliseconds between gust starts. */
const GUST_INTERVAL_MS = 8000;

/** Duration of a single gust in milliseconds. */
const GUST_DURATION_MS = 500;

/** Peak strength boost during a gust. */
const GUST_PEAK_BOOST = 0.3;

/** Exponential decay time constant for gust falloff (ms). */
const GUST_DECAY_TAU = 150;

// ── Wind System ─────────────────────────────────────────────────────────────

/**
 * Create a fresh wind state with defaults.
 */
export function createWindState(): WindState {
	return {
		angle: 0,
		strength: 0.5,
		gustTimer: GUST_INTERVAL_MS,
		elapsed: 0,
		gustRemaining: 0,
	};
}

/**
 * Advance wind simulation by `deltaMs` milliseconds.
 * Returns a new WindState (immutable).
 *
 * Wind angle oscillates slowly (period ~20 s).
 * Base strength oscillates between 0.3 and 0.7.
 * gustTimer counts down; when it reaches zero a gust fires — strength
 * spikes for ~500 ms then decays exponentially.
 */
export function updateWind(state: WindState, deltaMs: number): WindState {
	const elapsed = state.elapsed + deltaMs;
	const t = elapsed / 1000; // seconds for smooth oscillation

	// Slowly rotating angle
	const angle = Math.sin(t * 0.3) * Math.PI * 0.25; // ±45°

	// Base strength oscillation
	const baseStrength = 0.5 + Math.sin(t * 0.17) * 0.2; // 0.3 – 0.7

	// Gust countdown
	let gustTimer = state.gustTimer - deltaMs;
	let gustRemaining = state.gustRemaining > 0 ? state.gustRemaining - deltaMs : 0;

	// Fire a new gust when timer expires (and no gust is already active)
	if (gustTimer <= 0 && gustRemaining <= 0) {
		gustRemaining = GUST_DURATION_MS;
		gustTimer = GUST_INTERVAL_MS;
	}

	// Gust boost: exponential decay over GUST_DURATION_MS
	let strength = baseStrength;
	if (gustRemaining > 0) {
		const gustElapsed = GUST_DURATION_MS - gustRemaining;
		const gustBoost = GUST_PEAK_BOOST * Math.exp(-gustElapsed / GUST_DECAY_TAU);
		strength = Math.min(1, baseStrength + gustBoost);
	}

	return {
		angle,
		strength,
		gustTimer: Math.max(0, gustTimer),
		elapsed,
		gustRemaining: Math.max(0, gustRemaining),
	};
}

// ── Sway ────────────────────────────────────────────────────────────────────

/**
 * Calculate horizontal sway offset for a plant.
 *
 * Mass = stem height × leaf count. Heavier plants respond less.
 * Combines the plant's natural sway frequency with wind force.
 *
 * @param swayAmplitude  – species-defined max sway (px)
 * @param swayFrequency  – species-defined oscillation speed (rad/s)
 * @param plantMass      – stem height × leaf count (heavier → less sway)
 * @param windState      – current global wind
 * @param timeMs         – elapsed time in milliseconds
 * @returns x offset (px)
 */
export function calculateSway(
	swayAmplitude: number,
	swayFrequency: number,
	plantMass: number,
	windState: WindState,
	timeMs: number,
): number {
	const t = timeMs / 1000;

	// Mass dampening: heavier plants respond less.
	// Clamp mass ≥ 1 to avoid division issues.
	const mass = Math.max(plantMass, 1);
	const response = swayAmplitude / Math.sqrt(mass);

	// Base oscillation
	const baseSway = Math.sin(t * swayFrequency) * response;

	// Wind force component
	const windForce = Math.sin(windState.angle) * windState.strength * response * 2;

	// Gust adds a higher-frequency ripple while active
	const gust = windState.gustRemaining > 0 ? Math.sin(t * 3) * 0.1 : 0;

	return baseSway + windForce + gust;
}

// ── Breathing ───────────────────────────────────────────────────────────────

/**
 * Subtle idle scale oscillation.
 *
 * @param timeMs    – elapsed time in milliseconds
 * @param amplitude – max deviation from 1.0 (e.g. 0.01)
 * @returns scale factor centered on 1.0
 */
export function breathe(timeMs: number, amplitude: number): number {
	const t = timeMs / 1000;
	return 1 + Math.sin(t * 0.5) * amplitude;
}

// ── Stress Tremor ───────────────────────────────────────────────────────────

/**
 * Higher-frequency, lower-amplitude vibration for stressed plants.
 * Only activates above stress 0.3.
 * Uses two layered sine waves at frequencies ~12 and ~17 for organic
 * irregularity. Amplitude scales with stress.
 *
 * @param timeMs – elapsed time in milliseconds
 * @param stress – 0-1 stress level
 * @returns {x, y} pixel offset
 */
export function stressTremor(timeMs: number, stress: number): TremorOffset {
	if (stress <= 0.3) return { x: 0, y: 0 };

	const t = timeMs / 1000;
	const intensity = (stress - 0.3) * 0.03;
	const tx = Math.sin(t * 12) * intensity + Math.sin(t * 17) * intensity * 0.5;
	const ty = tx * 0.7;
	return { x: tx, y: ty };
}

// ── Harvest Pop ─────────────────────────────────────────────────────────────

/**
 * Compute the harvest "pop" effect for a 0→1 animation progress.
 *
 * - Springs upward (negative y) with overshoot
 * - Scales toward zero
 * - Fades out with ease-out
 *
 * @param progress – 0 to 1
 */
export function harvestPop(progress: number): HarvestPopResult {
	const p = Math.max(0, Math.min(1, progress));

	// Spring upward: peaks around progress 0.3, then settles
	// Using a damped sine for overshoot feel.
	const springY = -30 * Math.sin(p * Math.PI) * (1 - p);

	// Scale: starts at 1, ends at 0, with a slight pop at the start
	const popScale = p < 0.15 ? 1 + Math.sin((p / 0.15) * Math.PI) * 0.2 : 1;
	const scale = popScale * (1 - easeOutCubic(p));

	// Opacity: ease-out fade
	const opacity = 1 - easeOutCubic(p);

	return { scale, opacity, y: springY };
}

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

// ── Particle Burst ──────────────────────────────────────────────────────────

/**
 * Generate an expanding, fading burst of particles (colored circles).
 * Deterministic for a given count + progress.
 *
 * @param count    – number of particles (3-5 typical)
 * @param progress – 0 to 1 animation progress
 * @returns array of particle positions/attributes
 */
export function generateParticleBurst(count: number, progress: number): Particle[] {
	const p = Math.max(0, Math.min(1, progress));
	const particles: Particle[] = [];

	for (let i = 0; i < count; i++) {
		// Distribute evenly around a circle using golden-angle–like spacing
		const angle = (i / count) * Math.PI * 2 + Math.PI * 0.25; // offset so first isn't at 12-o'clock

		// Expand outward over time
		const radius = p * 25 * (0.8 + (i % 3) * 0.2); // slight per-particle variation

		const x = Math.cos(angle) * radius;
		const y = Math.sin(angle) * radius;

		// Scale: starts at 1, shrinks
		const scale = Math.max(0, 1 - p * 0.8);

		// Opacity: fade out with ease-out
		const opacity = Math.max(0, 1 - easeOutCubic(p));

		particles.push({ x, y, scale, opacity });
	}

	return particles;
}
