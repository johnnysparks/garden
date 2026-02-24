// Procedural animation calculation layer — pure functions, no DOM, no Svelte.

// ── Wind System ──────────────────────────────────────────────────────────────

export interface WindState {
	angle: number; // radians, slowly rotating
	strength: number; // 0-1, varies with weather
	gust_timer: number; // seconds remaining on current gust (0 = no gust)
}

/**
 * Create a fresh wind state with defaults.
 */
export function createWindState(): WindState {
	return {
		angle: 0,
		strength: 0.5,
		gust_timer: 0,
	};
}

// Gust cycle: one gust every ~8 seconds, lasting ~1.5 seconds.
const GUST_INTERVAL = 8; // seconds between gust starts
const GUST_DURATION = 1.5; // seconds a gust lasts

/**
 * Advance wind simulation by `deltaTime` seconds.
 * Returns a new WindState (immutable).
 *
 * Wind angle oscillates slowly (period ~20 s).
 * Base strength oscillates between 0.3 and 0.7.
 * Gusts fire periodically: the gust_timer counts down from GUST_DURATION to 0
 * and a new gust begins every GUST_INTERVAL seconds of accumulated time.
 *
 * We use `totalTime` (accumulated) so gust timing is deterministic.
 */
export function updateWind(state: WindState, deltaTime: number, totalTime: number): WindState {
	// Slowly rotating angle
	const angle = Math.sin(totalTime * 0.3) * Math.PI * 0.25; // ±45°

	// Base strength oscillation
	const strength = 0.5 + Math.sin(totalTime * 0.17) * 0.2; // 0.3 – 0.7

	// Gust: fires once per GUST_INTERVAL cycle
	const gustCycle = totalTime % GUST_INTERVAL;
	const gust_timer = gustCycle < GUST_DURATION ? GUST_DURATION - gustCycle : 0;

	return { angle, strength, gust_timer };
}

// ── Sway ─────────────────────────────────────────────────────────────────────

/**
 * Calculate horizontal sway offset for a plant.
 *
 * @param plantMass      – stem height × leaf count (heavier → less sway)
 * @param swayAmplitude  – species-defined max sway (px)
 * @param swayFrequency  – species-defined oscillation speed (rad/s)
 * @param windState      – current global wind
 * @param time           – elapsed time in seconds
 * @returns x offset (px)
 */
export function calculateSway(
	plantMass: number,
	swayAmplitude: number,
	swayFrequency: number,
	windState: WindState,
	time: number,
): number {
	// Mass dampening: heavier plants respond less.
	// Clamp mass ≥ 1 to avoid division issues.
	const mass = Math.max(plantMass, 1);
	const response = swayAmplitude / Math.sqrt(mass);

	// Base oscillation
	const baseSway = Math.sin(time * swayFrequency) * response;

	// Wind force component
	const windForce = Math.sin(windState.angle) * windState.strength * response * 2;

	// Gust adds a higher-frequency ripple while active
	const gust = windState.gust_timer > 0 ? Math.sin(time * 3) * 0.1 : 0;

	return baseSway + windForce + gust;
}

// ── Breathing ────────────────────────────────────────────────────────────────

/**
 * Subtle idle scale oscillation.
 *
 * @param time      – elapsed time in seconds
 * @param amplitude – max deviation from 1.0 (e.g. 0.01)
 * @returns scale factor centered on 1.0
 */
export function breathe(time: number, amplitude: number): number {
	return 1 + Math.sin(time * 0.5) * amplitude;
}

// ── Stress Tremor ────────────────────────────────────────────────────────────

export interface TremorOffset {
	x: number;
	y: number;
}

/**
 * Higher-frequency, lower-amplitude vibration for stressed plants.
 * Only activates above stress 0.3.
 * Uses two layered sine waves at different frequencies for organic feel.
 *
 * @param time   – elapsed time in seconds
 * @param stress – 0-1 stress level
 * @returns {x, y} pixel offset
 */
export function stressTremor(time: number, stress: number): TremorOffset {
	if (stress <= 0.3) return { x: 0, y: 0 };

	const intensity = (stress - 0.3) * 0.03;
	const tx = Math.sin(time * 12) * intensity + Math.sin(time * 17) * intensity * 0.5;
	const ty = tx * 0.7;
	return { x: tx, y: ty };
}

// ── Harvest Pop ──────────────────────────────────────────────────────────────

export interface HarvestPopResult {
	scale: number;
	opacity: number;
	y: number;
}

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
	const popScale = p < 0.15 ? 1 + Math.sin(p / 0.15 * Math.PI) * 0.2 : 1;
	const scale = popScale * (1 - easeOutCubic(p));

	// Opacity: ease-out fade
	const opacity = 1 - easeOutCubic(p);

	return { scale, opacity, y: springY };
}

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

// ── Particle Burst ───────────────────────────────────────────────────────────

export interface Particle {
	x: number;
	y: number;
	scale: number;
	opacity: number;
}

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
