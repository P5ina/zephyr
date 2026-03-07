// Animation reference video configuration
// Reference videos are pre-rendered in Blender from Mixamo animations

export const ANIMATION_TYPES = ['walk', 'run', 'idle', 'attack'] as const;
export type AnimationType = (typeof ANIMATION_TYPES)[number];

export const ELEVATION_PRESETS = ['side', 'low', 'iso', 'iso45', 'topdown'] as const;
export type ElevationPreset = (typeof ELEVATION_PRESETS)[number];

export const DIRECTIONS_4 = ['south', 'west', 'north', 'east'] as const;
export const DIRECTIONS_8 = [
	'south', 'southwest', 'west', 'northwest',
	'north', 'northeast', 'east', 'southeast',
] as const;

export type Direction = (typeof DIRECTIONS_8)[number];

export const ANIMATION_TYPE_LABELS: Record<AnimationType, string> = {
	walk: 'Walk',
	run: 'Run',
	idle: 'Idle',
	attack: 'Attack',
};

export const ELEVATION_LABELS: Record<ElevationPreset, string> = {
	side: 'Side View (0°)',
	low: 'Low Angle (15°)',
	iso: 'Isometric (30°)',
	iso45: 'High Iso (45°)',
	topdown: 'Top Down (90°)',
};

/**
 * Per-animation metadata.
 * - framesPerLoop: unique frames in one animation cycle
 * - loops: how many times the cycle repeats in the reference video
 * - duration: duration of one loop in seconds
 */
export interface AnimationMeta {
	framesPerLoop: number;
	loops: number;
	duration: number;
	available: boolean;
}

export const ANIMATION_META: Record<AnimationType, AnimationMeta> = {
	run: { framesPerLoop: 19, loops: 6, duration: 0.6, available: true },
	walk: { framesPerLoop: 31, loops: 3, duration: 1.0, available: true },
	idle: { framesPerLoop: 19, loops: 6, duration: 0.6, available: false },
	attack: { framesPerLoop: 19, loops: 6, duration: 0.6, available: false },
};

/**
 * Get the reference video URL for a given animation type, elevation, and direction.
 * Videos are stored at: {baseUrl}/{animationType}/{elevation}_{direction}.mp4
 */
export function getReferenceVideoUrl(
	animationType: AnimationType,
	elevation: ElevationPreset,
	direction: Direction,
): string {
	const baseUrl = 'https://cdn.p5ina.dev/gensprite/references';
	return `${baseUrl}/${animationType}/${elevation}_${direction}.mp4`;
}
