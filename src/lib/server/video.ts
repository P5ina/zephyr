/**
 * Video processing utilities using ffmpeg-static
 * Based on https://github.com/vercel-labs/ffmpeg-on-vercel
 */

import { spawn } from 'child_process';
import { createWriteStream, mkdirSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegPath from 'ffmpeg-static';

function getStaticPath(filename: string): string {
	// Try multiple possible locations
	const candidates = [
		join(process.cwd(), 'static', filename),
		join(process.cwd(), '..', 'static', filename),
	];

	for (const path of candidates) {
		if (existsSync(path)) {
			return path;
		}
	}

	// Return the most likely path even if not found
	return candidates[0];
}

interface CreateSpinVideoParams {
	inputImageUrl: string;
	frames: string[]; // 7 generated frame URLs
	addWatermark: boolean;
	originUrl?: string; // Base URL for fetching static assets on Vercel
}

/**
 * Download a file from URL to a local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status}`);
	}

	const buffer = await response.arrayBuffer();
	const writeStream = createWriteStream(destPath);
	writeStream.write(Buffer.from(buffer));
	writeStream.end();

	return new Promise((resolve, reject) => {
		writeStream.on('finish', resolve);
		writeStream.on('error', reject);
	});
}

/**
 * Create a spinning video from input image + 7 generated frames with OIIA audio
 *
 * Video structure:
 * - First ~1 second: static front frame (repeated)
 * - Then: spinning animation (frames 0-7 in sequence, looping)
 * - Total duration: ~4 seconds
 * - Audio: OIIA track synced with spin start
 */
export async function createSpinVideo(params: CreateSpinVideoParams): Promise<Buffer> {
	const { inputImageUrl, frames, addWatermark, originUrl } = params;

	if (frames.length === 0) {
		throw new Error('No frames provided');
	}

	console.log(`[video] Creating spin video with ${frames.length} generated frames`);

	// Create temp directory for this job
	const tempDir = join(tmpdir(), `spin-${Date.now()}`);
	mkdirSync(tempDir, { recursive: true });

	try {
		// Download input image (frame 0) and all generated frames
		const frameFiles: string[] = [];

		// Frame 0: input image
		const inputPath = join(tempDir, 'frame_000.png');
		await downloadFile(inputImageUrl, inputPath);
		frameFiles.push(inputPath);

		// Generated frames (1 to N)
		for (let i = 0; i < frames.length; i++) {
			const paddedIndex = String(i + 1).padStart(3, '0');
			const framePath = join(tempDir, `frame_${paddedIndex}.png`);
			await downloadFile(frames[i], framePath);
			frameFiles.push(framePath);
		}

		const totalFrames = frameFiles.length; // input + generated frames
		console.log(`[video] Downloaded ${totalFrames} total frames (1 input + ${frames.length} generated)`);

		// Create frame list file for ffmpeg concat
		// OIIA timing structure:
		// - 0:00.00 - 0:01.50: Static front (1.5s)
		// - 0:01.50 - 0:03.05: Fast spin (1.55s)
		// - 0:03.05 - 0:04.24: Static front (1.19s)
		// - 0:04.24 - 0:06.39: Slow spin (2.15s)
		// - 0:06.39 - 0:07.57: Static front (1.18s)
		// - 0:07.57 - 0:09.73: Slow spin (2.16s)
		// - 0:09.73 - 0:10.05: Static front (0.32s)
		// - 0:10.05 - 0:11.56: Fast spin (1.51s)
		// - 0:11.56 - end: Static front

		const frameListPath = join(tempDir, 'frames.txt');
		let frameList = '';

		const frontFrame = frameFiles[0]; // Input image is the front

		// Helper to add static front frame for a duration
		const addStatic = (duration: number) => {
			frameList += `file '${frontFrame}'\n`;
			frameList += `duration ${duration}\n`;
		};

		// Helper to add spin cycles (multiple rotations)
		const addSpin = (totalDuration: number, rotations: number) => {
			const totalFrameCount = totalFrames * rotations;
			const frameDuration = totalDuration / totalFrameCount;
			for (let r = 0; r < rotations; r++) {
				for (let i = 0; i < totalFrames; i++) {
					frameList += `file '${frameFiles[i]}'\n`;
					frameList += `duration ${frameDuration}\n`;
				}
			}
		};

		// Build the sequence
		addStatic(1.50);                    // 0:00.00 - 0:01.50: Static
		addSpin(1.55, 8);                   // 0:01.50 - 0:03.05: Fast spin (8 rotations)
		addStatic(1.19);                    // 0:03.05 - 0:04.24: Static
		addSpin(2.15, 2);                   // 0:04.24 - 0:06.39: Slow spin (2 rotations)
		addStatic(1.18);                    // 0:06.39 - 0:07.57: Static
		addSpin(2.16, 2);                   // 0:07.57 - 0:09.73: Slow spin (2 rotations)
		addStatic(0.32);                    // 0:09.73 - 0:10.05: Static
		addSpin(1.51, 8);                   // 0:10.05 - 0:11.56: Fast spin (8 rotations)
		addStatic(0.5);                     // 0:11.56 - end: Static (buffer)

		// Add final frame (required by concat demuxer)
		frameList += `file '${frontFrame}'\n`;

		const fs = await import('fs');
		fs.writeFileSync(frameListPath, frameList);

		console.log(`[video] Frame list created for OIIA sync (~12 seconds)`);

		// Check if audio/watermark exist locally, otherwise download from origin
		let audioPath = getStaticPath('audio/oiia.mp3');
		let watermarkPath = getStaticPath('watermark.png');
		let hasAudio = existsSync(audioPath);
		let watermarkExists = existsSync(watermarkPath);

		console.log(`[video] CWD: ${process.cwd()}`);
		console.log(`[video] Local audio path: ${audioPath}, exists: ${hasAudio}`);
		console.log(`[video] Local watermark path: ${watermarkPath}, exists: ${watermarkExists}`);

		// If local audio doesn't exist, download from CDN
		if (!hasAudio) {
			try {
				const audioTempPath = join(tempDir, 'oiia.mp3');
				await downloadFile('https://cdn.p5ina.dev/gensprite/oiia.mp3', audioTempPath);
				audioPath = audioTempPath;
				hasAudio = true;
				console.log(`[video] Downloaded audio from CDN to ${audioTempPath}`);
			} catch (e) {
				console.error(`[video] Failed to download audio from CDN:`, e);
			}
		}

		if (!watermarkExists && originUrl && addWatermark) {
			try {
				const watermarkTempPath = join(tempDir, 'watermark.png');
				await downloadFile(`${originUrl}/watermark.png`, watermarkTempPath);
				watermarkPath = watermarkTempPath;
				watermarkExists = true;
				console.log(`[video] Downloaded watermark from origin to ${watermarkTempPath}`);
			} catch (e) {
				console.error(`[video] Failed to download watermark from origin:`, e);
			}
		}

		const hasWatermarkFile = addWatermark && watermarkExists;
		console.log(`[video] Audio available: ${hasAudio}, Watermark: addWatermark=${addWatermark}, available=${watermarkExists}, willApply=${hasWatermarkFile}`);

		// Build ffmpeg command
		const outputPath = join(tempDir, 'output.mp4');
		const ffmpegArgs: string[] = [
			'-y', // Overwrite output
			'-f', 'concat',
			'-safe', '0',
			'-i', frameListPath,
		];

		// Add audio if available
		if (hasAudio) {
			ffmpegArgs.push('-i', audioPath);
		}

		// Add watermark if needed (loop it so it appears on all frames)
		if (hasWatermarkFile) {
			ffmpegArgs.push('-loop', '1', '-i', watermarkPath);
		}

		// Build filters - need to combine scale (for h264 compat) with optional watermark
		const scaleFilter = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

		if (hasWatermarkFile) {
			// Combine scale + watermark overlay in filter_complex
			// 1. Scale video to h264-compatible dimensions
			// 2. Scale watermark to 15% of video width, make semi-transparent (50% alpha)
			// 3. Overlay in bottom-right corner with padding
			// eval=frame ensures watermark appears on all frames
			ffmpegArgs.push(
				'-filter_complex',
				`[0:v]${scaleFilter}[scaled];` +
				`[2:v]scale=w=-1:h=100,format=rgba,colorchannelmixer=aa=0.8[wm];` +
				`[scaled][wm]overlay=W-w-20:H-h-20:eval=frame[out]`,
				'-map', '[out]',
			);
			if (hasAudio) {
				ffmpegArgs.push('-map', '1:a');
			}
		} else {
			// Just scale, no watermark
			ffmpegArgs.push(
				'-vf', scaleFilter,
				'-map', '0:v',
			);
			if (hasAudio) {
				ffmpegArgs.push('-map', '1:a');
			}
		}

		// Video encoding options
		ffmpegArgs.push(
			'-c:v', 'libx264',
			'-preset', 'fast',
			'-crf', '23',
			'-pix_fmt', 'yuv420p',
		);

		// Audio encoding
		if (hasAudio) {
			ffmpegArgs.push(
				'-c:a', 'aac',
				'-b:a', '128k',
			);
		}

		// Limit duration to ~12 seconds (OIIA audio length)
		ffmpegArgs.push('-t', '12');

		// Output
		ffmpegArgs.push(outputPath);

		console.log(`[video] Running ffmpeg with args:`, ffmpegArgs.join(' '));

		// Run ffmpeg
		await runFfmpeg(ffmpegArgs);

		// Read output file
		const videoBuffer = readFileSync(outputPath);
		return videoBuffer;
	} finally {
		// Cleanup temp directory
		try {
			const fs = await import('fs');
			const files = fs.readdirSync(tempDir);
			for (const file of files) {
				unlinkSync(join(tempDir, file));
			}
			fs.rmdirSync(tempDir);
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Run ffmpeg with given arguments
 */
function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!ffmpegPath) {
			reject(new Error('ffmpeg-static path not found'));
			return;
		}

		const process = spawn(ffmpegPath, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stderr = '';

		process.stderr?.on('data', (data) => {
			stderr += data.toString();
		});

		process.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
			}
		});

		process.on('error', (err) => {
			reject(new Error(`ffmpeg error: ${err.message}`));
		});
	});
}
