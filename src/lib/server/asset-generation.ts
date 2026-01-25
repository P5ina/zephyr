import { put } from '@vercel/blob';
import sharp from 'sharp';

// PBR Generation via Sharp (Sobel operator)
export async function generatePBRMaps(buffer: Buffer) {
	const metadata = await sharp(buffer).metadata();
	const width = metadata.width ?? 0;
	const height = metadata.height ?? 0;
	if (!width || !height) {
		throw new Error('Could not determine image dimensions');
	}

	const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
	const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

	const gx = await sharp(buffer)
		.grayscale()
		.convolve({ width: 3, height: 3, kernel: sobelX })
		.raw()
		.toBuffer();
	const gy = await sharp(buffer)
		.grayscale()
		.convolve({ width: 3, height: 3, kernel: sobelY })
		.raw()
		.toBuffer();

	// Combine into normal map
	const normalData = new Uint8Array(width * height * 3);
	for (let i = 0; i < width * height; i++) {
		const nx = (gx[i] - 128) / 128;
		const ny = (gy[i] - 128) / 128;
		const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
		normalData[i * 3] = Math.round((nx + 1) * 127.5);
		normalData[i * 3 + 1] = Math.round((ny + 1) * 127.5);
		normalData[i * 3 + 2] = Math.round(nz * 255);
	}

	const normal = await sharp(Buffer.from(normalData), {
		raw: { width, height, channels: 3 },
	})
		.png()
		.toBuffer();
	const roughness = await sharp(buffer)
		.grayscale()
		.negate()
		.normalise()
		.png()
		.toBuffer();
	const heightMap = await sharp(buffer)
		.grayscale()
		.normalise()
		.png()
		.toBuffer();

	return { normal, roughness, height: heightMap };
}

export async function uploadToBlob(data: Buffer, path: string) {
	const blob = await put(path, data, {
		access: 'public',
		contentType: 'image/png',
	});
	return blob.url;
}
