import JSZip from 'jszip';

interface TrainingImageData {
	url: string;
	filename: string;
	caption: string;
}

export async function createTrainingZip(
	images: TrainingImageData[],
): Promise<Blob> {
	const zip = new JSZip();

	for (const img of images) {
		const res = await fetch(img.url);
		if (!res.ok) {
			throw new Error(`Failed to fetch image: ${img.filename}`);
		}
		// Use arrayBuffer instead of blob for Node.js compatibility
		const arrayBuffer = await res.arrayBuffer();
		const base = img.filename.replace(/\.[^/.]+$/, '');
		zip.file(`${base}.png`, arrayBuffer);
		zip.file(`${base}.txt`, img.caption);
	}

	return zip.generateAsync({ type: 'blob' });
}
