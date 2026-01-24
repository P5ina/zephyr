<script lang="ts">
import { T, useTask } from '@threlte/core';
import { OrbitControls, Environment } from '@threlte/extras';
import {
	SphereGeometry,
	MeshStandardMaterial,
	TextureLoader,
	RepeatWrapping,
	SRGBColorSpace,
	type Texture,
} from 'three';

interface Props {
	basecolorUrl?: string | null;
	normalUrl?: string | null;
	roughnessUrl?: string | null;
	metallicUrl?: string | null;
	heightUrl?: string | null;
	shape?: 'sphere' | 'cube' | 'plane';
	autoRotate?: boolean;
}

const props: Props = $props();

// Derive reactive values from props
const basecolorUrl = $derived(props.basecolorUrl ?? null);
const normalUrl = $derived(props.normalUrl ?? null);
const roughnessUrl = $derived(props.roughnessUrl ?? null);
const metallicUrl = $derived(props.metallicUrl ?? null);
const heightUrl = $derived(props.heightUrl ?? null);
const shape = $derived(props.shape ?? 'sphere');
const autoRotate = $derived(props.autoRotate ?? true);

const loader = new TextureLoader();
loader.crossOrigin = 'anonymous';

let basecolorMap = $state<Texture | null>(null);
let normalMap = $state<Texture | null>(null);
let roughnessMap = $state<Texture | null>(null);
let metallicMap = $state<Texture | null>(null);
let displacementMap = $state<Texture | null>(null);

let meshRotation = $state({ x: 0, y: 0, z: 0 });

function loadTexture(url: string | null | undefined): Promise<Texture | null> {
	if (!url) return Promise.resolve(null);
	return new Promise((resolve) => {
		loader.load(
			url,
			(texture) => {
				texture.wrapS = RepeatWrapping;
				texture.wrapT = RepeatWrapping;
				texture.needsUpdate = true;
				resolve(texture);
			},
			undefined,
			(err) => {
				console.error('Failed to load texture:', url, err);
				resolve(null);
			}
		);
	});
}

$effect(() => {
	const url = basecolorUrl;
	loadTexture(url).then((t) => {
		if (t) t.colorSpace = SRGBColorSpace;
		basecolorMap = t;
	});
});

$effect(() => {
	const url = normalUrl;
	loadTexture(url).then((t) => (normalMap = t));
});

$effect(() => {
	const url = roughnessUrl;
	loadTexture(url).then((t) => (roughnessMap = t));
});

$effect(() => {
	const url = metallicUrl;
	loadTexture(url).then((t) => (metallicMap = t));
});

$effect(() => {
	const url = heightUrl;
	loadTexture(url).then((t) => (displacementMap = t));
});

useTask((delta) => {
	if (autoRotate) {
		meshRotation.y += delta * 0.3;
	}
});

// Key to force material recreation when textures load
const materialKey = $derived(
	[basecolorMap?.uuid, normalMap?.uuid, roughnessMap?.uuid, metallicMap?.uuid, displacementMap?.uuid]
		.filter(Boolean)
		.join('-') || 'empty'
);
</script>

<T.PerspectiveCamera makeDefault position={[0, 0, 3]} fov={45}>
	<OrbitControls enableDamping dampingFactor={0.05} />
</T.PerspectiveCamera>

<Environment />

<T.AmbientLight intensity={0.3} />
<T.DirectionalLight position={[5, 5, 5]} intensity={1} />

{#key materialKey}
	{#if shape === 'sphere'}
		<T.Mesh rotation.y={meshRotation.y}>
			<T.SphereGeometry args={[1, 64, 64]} />
			<T.MeshStandardMaterial
				map={basecolorMap}
				normalMap={normalMap}
				roughnessMap={roughnessMap}
				metalnessMap={metallicMap}
				displacementMap={displacementMap}
				displacementScale={displacementMap ? 0.1 : 0}
				roughness={roughnessMap ? 1 : 0.5}
				metalness={metallicMap ? 1 : 0}
			/>
		</T.Mesh>
	{:else if shape === 'cube'}
		<T.Mesh rotation.y={meshRotation.y} rotation.x={0.3}>
			<T.BoxGeometry args={[1.5, 1.5, 1.5]} />
			<T.MeshStandardMaterial
				map={basecolorMap}
				normalMap={normalMap}
				roughnessMap={roughnessMap}
				metalnessMap={metallicMap}
				roughness={roughnessMap ? 1 : 0.5}
				metalness={metallicMap ? 1 : 0}
			/>
		</T.Mesh>
	{:else}
		<T.Mesh rotation.x={-Math.PI / 2} rotation.z={meshRotation.y}>
			<T.PlaneGeometry args={[2.5, 2.5, 64, 64]} />
			<T.MeshStandardMaterial
				map={basecolorMap}
				normalMap={normalMap}
				roughnessMap={roughnessMap}
				metalnessMap={metallicMap}
				displacementMap={displacementMap}
				displacementScale={displacementMap ? 0.2 : 0}
				roughness={roughnessMap ? 1 : 0.5}
				metalness={metallicMap ? 1 : 0}
			/>
		</T.Mesh>
	{/if}
{/key}
