/**
 * Animation frame extraction and archiving.
 * Downloads direction videos, extracts frames with ffmpeg,
 * packages them into a zip archive.
 */

import { spawn } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, unlinkSync, rmdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegPath from 'ffmpeg-static';
import JSZip from 'jszip';
import sharp from 'sharp';
import { ANIMATION_META, type AnimationType } from '$lib/animation-config';
import { removeImageBackground } from '$lib/server/fal';

const DIRECTIONS_4 = ['south', 'west', 'north', 'east'] as const;
const DIRECTIONS_8 = [
	'south', 'southwest', 'west', 'northwest',
	'north', 'northeast', 'east', 'southeast',
] as const;

async function downloadFile(url: string, destPath: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status}`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	writeFileSync(destPath, buffer);
}

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!ffmpegPath) {
			reject(new Error('ffmpeg-static path not found'));
			return;
		}

		const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
		let stderr = '';
		proc.stderr?.on('data', (data) => { stderr += data.toString(); });
		proc.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffmpeg failed (code ${code}): ${stderr}`));
				return;
			}
			resolve();
		});
		proc.on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)));
	});
}

function getVideoTempExtension(url: string): '.webm' | '.mov' | '.mp4' {
	const normalized = url.toLowerCase();
	if (normalized.includes('.webm')) return '.webm';
	if (normalized.includes('.mov')) return '.mov';
	return '.mp4';
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex++;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
	);

	return results;
}

export async function trimVideoToLoopBuffer(
	sourceUrl: string,
	durationSeconds: number,
): Promise<{ buffer: Buffer; contentType: 'video/webm'; extension: '.webm' }> {
	const tempDir = join(tmpdir(), `animate-trim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	mkdirSync(tempDir, { recursive: true });

	try {
		const inputPath = join(tempDir, `input${getVideoTempExtension(sourceUrl)}`);
		const outputPath = join(tempDir, 'trimmed.webm');

		await downloadFile(sourceUrl, inputPath);
		await runFfmpeg([
			'-y',
			'-i',
			inputPath,
			'-t',
			durationSeconds.toString(),
			'-an',
			'-c:v',
			'libvpx-vp9',
			'-pix_fmt',
			'yuva420p',
			'-auto-alt-ref',
			'0',
			outputPath,
		]);

		return {
			buffer: readFileSync(outputPath),
			contentType: 'video/webm',
			extension: '.webm',
		};
	} finally {
		try {
			cleanupDir(tempDir);
		} catch {
			// Ignore cleanup errors
		}
	}
}

async function extractAllFrames(videoPath: string, outputDir: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		// Force RGBA so alpha from Bria's transparent video survives frame extraction.
		const args = [
			'-y',
			'-i',
			videoPath,
			'-vf',
			'format=rgba',
			'-pix_fmt',
			'rgba',
			join(outputDir, 'frame_%04d.png'),
		];
		runFfmpeg(args)
			.then(() => {
			const files = readdirSync(outputDir)
				.filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
				.sort()
				.map((f) => join(outputDir, f));
			resolve(files);
			})
			.catch(reject);
	});
}

interface ArchiveResult {
	buffer: Buffer;
	frameCount: number;
	tileWidth: number;
	tileHeight: number;
}

/**
 * Build a zip archive from direction videos.
 * Pipeline: download → extract frames → zip.
 */
export async function buildFrameArchive(
	directionVideos: Record<string, string>,
	directionCount: 4 | 8,
	animationType: AnimationType,
	onProgress?: (stage: string, progress: number) => Promise<void>,
): Promise<ArchiveResult> {
	const allDirections = directionCount === 4 ? DIRECTIONS_4 : DIRECTIONS_8;
	const directions = allDirections.filter((d) => directionVideos[d]);
	if (directions.length === 0) {
		throw new Error('No direction videos provided');
	}
	const meta = ANIMATION_META[animationType];
	const tempDir = join(tmpdir(), `animate-${Date.now()}`);
	mkdirSync(tempDir, { recursive: true });

	try {
		const zip = new JSZip();
		const allFrames: { direction: string; frames: string[] }[] = [];

		// Phase 1: Download and extract frames
		for (let di = 0; di < directions.length; di++) {
			const dir = directions[di];
			const videoUrl = directionVideos[dir];
			if (!videoUrl) continue;

			const videoPath = join(tempDir, `${dir}${getVideoTempExtension(videoUrl)}`);
			const framesDir = join(tempDir, `${dir}_frames`);
			mkdirSync(framesDir, { recursive: true });

			const dlProgress = Math.round(65 + (di / directions.length) * 10);
			await onProgress?.(`Downloading ${dir} (${di + 1}/${directions.length})...`, dlProgress);

			await downloadFile(videoUrl, videoPath);
			const allExtracted = await extractAllFrames(videoPath, framesDir);
			const firstLoopFrames = allExtracted.slice(0, meta.framesPerLoop);
			allFrames.push({ direction: dir, frames: firstLoopFrames });

			console.log(`[frames] ${dir}: ${allExtracted.length} total, using ${firstLoopFrames.length}`);
		}

		const frameCount = Math.min(...allFrames.map((f) => f.frames.length));
		if (frameCount === 0) {
			throw new Error('No frames extracted from videos');
		}

		const firstFrameMeta = await sharp(allFrames[0].frames[0]).metadata();
		const tileWidth = firstFrameMeta.width!;
		const tileHeight = firstFrameMeta.height!;

		// Phase 2: Remove backgrounds frame-by-frame and add PNGs to the zip
		const totalFrames = allFrames.length * frameCount;
		let processedFrames = 0;

		for (const { direction, frames } of allFrames) {
			const folder = zip.folder(direction)!;
			const processedDirectionFrames = await mapWithConcurrency(
				frames.slice(0, frameCount),
				4,
				async (framePath, index) => {
					const frameData = await removeImageBackground(readFileSync(framePath));
					processedFrames++;

					if (processedFrames % 3 === 0 || processedFrames === totalFrames) {
						const bgProgress = Math.round(78 + (processedFrames / totalFrames) * 17);
						await onProgress?.(`Removing backgrounds (${processedFrames}/${totalFrames})...`, bgProgress);
					}

					return {
						index,
						frameData,
					};
				},
			);

			for (const { index, frameData } of processedDirectionFrames) {
				folder.file(`${String(index + 1).padStart(4, '0')}.png`, frameData);
			}
		}

		await onProgress?.('Compressing archive...', 96);
		const buffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

		return { buffer, frameCount, tileWidth, tileHeight };
	} finally {
		try {
			cleanupDir(tempDir);
		} catch {
			// Ignore
		}
	}
}

function cleanupDir(dir: string) {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			cleanupDir(fullPath);
		} else {
			unlinkSync(fullPath);
		}
	}
	rmdirSync(dir);
}
