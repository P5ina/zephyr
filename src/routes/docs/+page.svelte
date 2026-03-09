<script lang="ts">
import {
	Book,
	Coins,
	Film,
	Key,
	Layers,
	Palette,
	Rotate3d,
	RotateCw,
	Sparkles,
	Zap,
} from 'lucide-svelte';
import Footer from '$lib/components/Footer.svelte';
import Header from '$lib/components/Header.svelte';
import CodeBlock from '$lib/components/CodeBlock.svelte';
import { PRICING } from '$lib/pricing';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let selectedLang = $state<'bash' | 'python' | 'typescript'>('bash');

const spriteExamples = {
	bash: `curl -X POST https://gensprite.ai/api/assets/generate \\
  -H "Authorization: Bearer gsk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "medieval knight with sword", "style": "hand-painted"}'`,
	python: `import requests

response = requests.post(
    "https://gensprite.ai/api/assets/generate",
    headers={"Authorization": "Bearer gsk_your_key"},
    json={"prompt": "medieval knight with sword", "style": "hand-painted"},
)
data = response.json()
print(data["asset"]["id"])`,
	typescript: `const response = await fetch("https://gensprite.ai/api/assets/generate", {
  method: "POST",
  headers: {
    "Authorization": "Bearer gsk_your_key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ prompt: "medieval knight with sword", style: "hand-painted" }),
});
const data = await response.json();
console.log(data.asset.id);`,
};

const workflowExamples = {
	bash: `# 1. Generate a sprite
RESPONSE=$(curl -s -X POST https://gensprite.ai/api/assets/generate \\
  -H "Authorization: Bearer gsk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "fire elemental monster", "style": "anime"}')

ASSET_ID=$(echo $RESPONSE | jq -r '.asset.id')

# 2. Poll until complete
while true; do
  STATUS=$(curl -s \\
    -H "Authorization: Bearer gsk_your_key" \\
    https://gensprite.ai/api/assets/$ASSET_ID/status)

  STATE=$(echo $STATUS | jq -r '.status')
  echo "Status: $STATE"

  if [ "$STATE" = "completed" ]; then
    IMAGE_URL=$(echo $STATUS | jq -r '.resultUrls.processed')
    echo "Done! $IMAGE_URL"
    break
  elif [ "$STATE" = "failed" ]; then
    echo "Failed: $(echo $STATUS | jq -r '.errorMessage')"
    break
  fi

  sleep 3
done

# 3. Download the image
curl -o sprite.png "$IMAGE_URL"`,
	python: `import time
import requests

API_KEY = "gsk_your_key"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# 1. Generate a sprite
response = requests.post(
    "https://gensprite.ai/api/assets/generate",
    headers=HEADERS,
    json={"prompt": "fire elemental monster", "style": "anime"},
)
asset_id = response.json()["asset"]["id"]

# 2. Poll until complete
while True:
    status = requests.get(
        f"https://gensprite.ai/api/assets/{asset_id}/status",
        headers=HEADERS,
    ).json()
    print(f"Status: {status['status']}")

    if status["status"] == "completed":
        image_url = status["resultUrls"]["processed"]
        print(f"Done! {image_url}")
        break
    elif status["status"] == "failed":
        print(f"Failed: {status.get('errorMessage')}")
        break

    time.sleep(3)

# 3. Download the image
img = requests.get(image_url)
with open("sprite.png", "wb") as f:
    f.write(img.content)`,
	typescript: `const API_KEY = "gsk_your_key";
const headers = { "Authorization": \`Bearer \${API_KEY}\` };

// 1. Generate a sprite
const genRes = await fetch("https://gensprite.ai/api/assets/generate", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "fire elemental monster", style: "anime" }),
});
const { asset } = await genRes.json();

// 2. Poll until complete
while (true) {
  const statusRes = await fetch(
    \`https://gensprite.ai/api/assets/\${asset.id}/status\`,
    { headers },
  );
  const status = await statusRes.json();
  console.log(\`Status: \${status.status}\`);

  if (status.status === "completed") {
    console.log(\`Done! \${status.resultUrls.processed}\`);
    break;
  } else if (status.status === "failed") {
    console.log(\`Failed: \${status.errorMessage}\`);
    break;
  }

  await new Promise((r) => setTimeout(r, 3000));
}`,
};
</script>

<svelte:head>
	<title>API Documentation - GenSprite</title>
</svelte:head>

<Header user={data.user} variant="simple" showBack ctaText="Dashboard" ctaHref="/dashboard" />

<div class="docs-page">
	<h1 class="page-title">API Documentation</h1>

	<div class="docs-content">
		<!-- Introduction -->
		<div class="panel">
			<div class="flex items-center gap-3 mb-4">
				<div class="icon-badge icon-badge-blue">
					<Book class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Getting Started</h2>
					<p class="panel-sub">Integrate GenSprite into your pipeline</p>
				</div>
			</div>
			<p class="docs-text">
				The GenSprite API lets you generate sprites, textures, concept art, rotations, and animations programmatically.
				All endpoints use JSON requests/responses and require API key authentication.
			</p>
			<div class="base-url">
				<span class="base-url-label">Base URL</span>
				<code class="base-url-value">https://gensprite.ai</code>
			</div>
		</div>

		<!-- Authentication -->
		<div class="panel" id="auth">
			<div class="flex items-center gap-3 mb-4">
				<div class="icon-badge icon-badge-amber">
					<Key class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Authentication</h2>
					<p class="panel-sub">API key via Bearer token</p>
				</div>
			</div>
			<p class="docs-text">
				All API requests require an API key passed in the <code>Authorization</code> header.
				Generate a key from your <a href="/dashboard" class="docs-link">Dashboard</a>.
			</p>
			<CodeBlock code="Authorization: Bearer gsk_your_api_key" lang="bash" label="Header" />
			<div class="note">
				API keys start with <code>gsk_</code>. Keys are shown once on creation — store them securely.
				You can revoke and regenerate keys from the Dashboard at any time.
			</div>
		</div>

		<!-- Errors -->
		<div class="panel" id="errors">
			<h2 class="panel-heading mb-3">Errors</h2>
			<p class="docs-text mb-4">
				The API returns standard HTTP status codes. Error responses include a JSON body with a <code>message</code> field.
			</p>
			<div class="error-table-wrap">
				<table class="error-table">
					<thead>
						<tr>
							<th>Status</th>
							<th>Meaning</th>
						</tr>
					</thead>
					<tbody>
						<tr><td><code>400</code></td><td>Bad request — invalid or missing parameters</td></tr>
						<tr><td><code>401</code></td><td>Unauthorized — missing or invalid API key</td></tr>
						<tr><td><code>402</code></td><td>Insufficient tokens</td></tr>
						<tr><td><code>404</code></td><td>Resource not found</td></tr>
						<tr><td><code>429</code></td><td>Rate limited</td></tr>
						<tr><td><code>500</code></td><td>Internal server error</td></tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- Token Costs -->
		<div class="panel" id="tokens">
			<div class="flex items-center gap-3 mb-4">
				<div class="icon-badge icon-badge-green">
					<Coins class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Token Costs</h2>
					<p class="panel-sub">Tokens are deducted before generation, refunded on failure</p>
				</div>
			</div>
			<div class="costs-grid">
				<div class="cost-row">
					<div class="cost-row-icon"><Sparkles class="w-4 h-4" /></div>
					<span class="cost-row-name">Sprite</span>
					<span class="cost-row-amount">{PRICING.tokenCosts.sprite} tokens</span>
				</div>
				<div class="cost-row">
					<div class="cost-row-icon"><Layers class="w-4 h-4" /></div>
					<span class="cost-row-name">PBR Texture</span>
					<span class="cost-row-amount">{PRICING.tokenCosts.texture} tokens</span>
				</div>
				<div class="cost-row">
					<div class="cost-row-icon"><Palette class="w-4 h-4" /></div>
					<span class="cost-row-name">Concept Art</span>
					<span class="cost-row-amount">{PRICING.tokenCosts.conceptArt} tokens</span>
				</div>
				<div class="cost-row">
					<div class="cost-row-icon"><Palette class="w-4 h-4" /></div>
					<span class="cost-row-name">Concept Art Restyle</span>
					<span class="cost-row-amount">{PRICING.tokenCosts.conceptArtRestyle} tokens</span>
				</div>
				<div class="cost-row">
					<div class="cost-row-icon"><Rotate3d class="w-4 h-4" /></div>
					<span class="cost-row-name">Rotation (4-dir)</span>
					<span class="cost-row-amount">{PRICING.tokenCosts.rotationNew} tokens</span>
				</div>
				<div class="cost-row">
					<div class="cost-row-icon"><RotateCw class="w-4 h-4" /></div>
					<span class="cost-row-name">Rotation (8-dir)</span>
					<span class="cost-row-amount">{PRICING.tokenCosts.rotation} tokens</span>
				</div>
				<div class="cost-row">
					<div class="cost-row-icon"><Film class="w-4 h-4" /></div>
					<span class="cost-row-name">Animation</span>
					<span class="cost-row-amount">dynamic</span>
				</div>
			</div>
		</div>

		<!-- Agent Config -->
		<div class="panel" id="agent-config">
			<div class="endpoint-header">
				<span class="method-badge method-get">GET</span>
				<code class="endpoint-path">/api/agent/config</code>
			</div>
			<p class="docs-text">
				Fetch platform configuration for the GenSprite agent. Returns the Anthropic API key (platform-owned, not user-facing),
				model settings, and the user's current credit balance. Rate limited to <strong>1 request per minute</strong> per key.
			</p>
			<h3 class="subsection">Response</h3>
			<CodeBlock label="200 OK" code={`{
  "anthropic_api_key": "sk-ant-...",
  "model": "claude-opus-4-5",
  "max_tokens": 8096,
  "user_id": "abc123",
  "credits": 142
}`} />
		</div>

		<!-- Balance -->
		<div class="panel" id="balance">
			<div class="endpoint-header">
				<span class="method-badge method-get">GET</span>
				<code class="endpoint-path">/api/billing</code>
			</div>
			<p class="docs-text">
				Get your current token balance and pricing information.
			</p>
			<h3 class="subsection">Response</h3>
			<CodeBlock label="200 OK" code={`{
  "tokens": 47,
  "bonusTokens": 95,
  "totalTokens": 142,
  "tokenCosts": {
    "sprite": 3,
    "texture": 4,
    "rotation": 25,
    "rotationNew": 12,
    "conceptArt": 4,
    "conceptArtRestyle": 6,
    "spin": 25,
    "rotationSingleView": 7
  }
}`} />
		</div>

		<!-- Generate Sprite -->
		<div class="panel" id="generate-sprite">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/assets/generate</code>
			</div>
			<p class="docs-text">
				Generate a game sprite with transparent background. Costs <strong>{PRICING.tokenCosts.sprite} tokens</strong>.
			</p>
			<h3 class="subsection">Request Body</h3>
			<div class="params-table-wrap">
				<table class="params-table">
					<thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
					<tbody>
						<tr><td><code>prompt</code></td><td>string</td><td>Yes</td><td>Description of the sprite (max 2000 chars)</td></tr>
						<tr><td><code>style</code></td><td>string</td><td>No</td><td><code>hand-painted</code>, <code>anime</code>, <code>cartoon</code>, <code>realistic</code>, <code>vector</code>, <code>outline</code></td></tr>
						<tr><td><code>width</code></td><td>number</td><td>No</td><td>Image width in px (default: 512)</td></tr>
						<tr><td><code>height</code></td><td>number</td><td>No</td><td>Image height in px (default: 512)</td></tr>
						<tr><td><code>seed</code></td><td>number</td><td>No</td><td>Seed for reproducibility</td></tr>
					</tbody>
				</table>
			</div>
			<CodeBlock code={spriteExamples} {selectedLang} onLangChange={(l) => selectedLang = l} />
			<h3 class="subsection">Response</h3>
			<CodeBlock label="200 OK" code={`{
  "asset": {
    "id": "abc123",
    "visibleId": "xK9mQ2",
    "status": "pending",
    "prompt": "medieval knight with sword",
    "width": 512,
    "height": 512,
    "tokenCost": 3,
    "createdAt": "2026-03-09T12:00:00.000Z"
  },
  "isGuest": false,
  "tokensUsed": 3,
  "tokensRemaining": 44,
  "bonusTokensRemaining": 95,
  "totalTokensRemaining": 139
}`} />
		</div>

		<!-- Check Sprite Status -->
		<div class="panel" id="sprite-status">
			<div class="endpoint-header">
				<span class="method-badge method-get">GET</span>
				<code class="endpoint-path">/api/assets/{`{id}`}/status</code>
			</div>
			<p class="docs-text">
				Poll the status of a sprite generation. When <code>status</code> is <code>"completed"</code>, the image URLs are in <code>resultUrls</code>.
				Poll every 2–5 seconds.
			</p>
			<h3 class="subsection">Response</h3>
			<CodeBlock label="200 OK — completed" code={`{
  "id": "abc123",
  "status": "completed",
  "progress": 100,
  "resultUrls": {
    "raw": "https://...",
    "processed": "https://..."
  },
  "seed": 4281937,
  "completedAt": "2026-03-09T12:00:30.000Z"
}`} />
			<div class="note">
				<code>status</code> values: <code>pending</code> → <code>processing</code> → <code>completed</code> | <code>failed</code>
			</div>
		</div>

		<!-- Cancel Sprite -->
		<div class="panel" id="sprite-cancel">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/assets/{`{id}`}/cancel</code>
			</div>
			<p class="docs-text">
				Cancel an in-progress sprite generation. Tokens are automatically refunded if the generation hasn't completed.
			</p>
			<h3 class="subsection">Response</h3>
			<CodeBlock label="200 OK" code={`{
  "success": true,
  "tokensRefunded": 3
}`} />
		</div>

		<!-- List Assets -->
		<div class="panel" id="list-assets">
			<div class="endpoint-header">
				<span class="method-badge method-get">GET</span>
				<code class="endpoint-path">/api/assets</code>
			</div>
			<p class="docs-text">
				List your generated sprites with cursor-based pagination.
			</p>
			<h3 class="subsection">Query Parameters</h3>
			<div class="params-table-wrap">
				<table class="params-table">
					<thead><tr><th>Field</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
					<tbody>
						<tr><td><code>cursor</code></td><td>string</td><td>—</td><td>Asset ID to paginate from</td></tr>
						<tr><td><code>limit</code></td><td>number</td><td>20</td><td>Results per page (max 50)</td></tr>
					</tbody>
				</table>
			</div>
			<h3 class="subsection">Response</h3>
			<CodeBlock label="200 OK" code={`{
  "assets": [ ... ],
  "nextCursor": "xyz789"
}`} />
		</div>

		<!-- Generate Texture -->
		<div class="panel" id="generate-texture">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/textures/generate</code>
			</div>
			<p class="docs-text">
				Generate a PBR texture set (basecolor, normal, roughness, metallic maps). Costs <strong>{PRICING.tokenCosts.texture} tokens</strong>.
			</p>
			<h3 class="subsection">Request Body</h3>
			<div class="params-table-wrap">
				<table class="params-table">
					<thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
					<tbody>
						<tr><td><code>prompt</code></td><td>string</td><td>Yes</td><td>Description of the texture (max 2000 chars)</td></tr>
					</tbody>
				</table>
			</div>
			<h3 class="subsection">Status &amp; Cancel</h3>
			<p class="docs-text">
				Use <code>GET /api/textures/{`{id}`}/status</code> and <code>POST /api/textures/{`{id}`}/cancel</code>.
				Completed textures include <code>basecolorUrl</code>, <code>normalUrl</code>, <code>roughnessUrl</code>, <code>metallicUrl</code>.
			</p>
		</div>

		<!-- Generate Concept Art -->
		<div class="panel" id="generate-concept-art">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/concept-art/generate</code>
			</div>
			<p class="docs-text">
				Generate full-scene concept art. Costs <strong>{PRICING.tokenCosts.conceptArt} tokens</strong> (standard) or <strong>{PRICING.tokenCosts.conceptArtRestyle} tokens</strong> (restyle).
			</p>
			<h3 class="subsection">Request Body (JSON)</h3>
			<div class="params-table-wrap">
				<table class="params-table">
					<thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
					<tbody>
						<tr><td><code>prompt</code></td><td>string</td><td>Yes</td><td>Scene description (max 2000 chars)</td></tr>
						<tr><td><code>imageSize</code></td><td>string</td><td>No</td><td><code>landscape_16_9</code>, <code>landscape_4_3</code>, <code>square_hd</code>, <code>portrait_4_3</code>, <code>portrait_16_9</code></td></tr>
						<tr><td><code>style</code></td><td>string</td><td>No</td><td><code>painterly</code>, <code>anime</code>, <code>realistic</code>, <code>pixel-art</code>, <code>watercolor</code>, <code>sci-fi</code>, <code>fantasy</code>, <code>ink-drawing</code></td></tr>
						<tr><td><code>seed</code></td><td>number</td><td>No</td><td>Seed for reproducibility</td></tr>
					</tbody>
				</table>
			</div>
			<p class="docs-text mt-3">
				For <strong>restyle mode</strong>, use <code>multipart/form-data</code> with a <code>compositionImage</code> file, <code>mode=restyle</code>,
				<code>controlMethod</code> (<code>canny</code> | <code>depth</code>), and <code>controlStrength</code> (0–100).
			</p>
			<h3 class="subsection">Status &amp; Cancel</h3>
			<p class="docs-text">
				Use <code>GET /api/concept-art/{`{id}`}/status</code> and <code>POST /api/concept-art/{`{id}`}/cancel</code>.
				Completed result includes <code>imageUrl</code>.
			</p>
		</div>

		<!-- 8-Dir Rotation -->
		<div class="panel" id="rotation-8dir">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/rotate/generate</code>
			</div>
			<p class="docs-text">
				Generate 8-directional rotations from an input image. Costs <strong>{PRICING.tokenCosts.rotation} tokens</strong>.
				Accepts <code>multipart/form-data</code> (file upload) or JSON (image URL).
			</p>
			<h3 class="subsection">Request Body</h3>
			<div class="params-table-wrap">
				<table class="params-table">
					<thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
					<tbody>
						<tr><td><code>image</code></td><td>File</td><td>*</td><td>Image file (PNG/JPEG/WebP, max 10MB)</td></tr>
						<tr><td><code>imageUrl</code></td><td>string</td><td>*</td><td>URL of existing image (* provide image or imageUrl)</td></tr>
						<tr><td><code>elevation</code></td><td>number</td><td>No</td><td>Camera elevation angle, -90 to 90 (default: 0)</td></tr>
						<tr><td><code>prompt</code></td><td>string</td><td>No</td><td>Optional description</td></tr>
					</tbody>
				</table>
			</div>
			<h3 class="subsection">Status &amp; Cancel</h3>
			<p class="docs-text">
				Use <code>GET /api/rotate/{`{id}`}/status</code> and <code>POST /api/rotate/{`{id}`}/cancel</code>.
				Completed result includes <code>rotationN</code>, <code>rotationNE</code>, <code>rotationE</code>, etc. (8 direction URLs).
			</p>
		</div>

		<!-- 4-Dir Rotation -->
		<div class="panel" id="rotation-4dir">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/rotate-new/generate</code>
			</div>
			<p class="docs-text">
				Generate 4-directional rotations (front, right, back, left). Costs <strong>{PRICING.tokenCosts.rotationNew} tokens</strong>.
				Same request format as 8-dir rotation.
			</p>
			<h3 class="subsection">Status &amp; Cancel</h3>
			<p class="docs-text">
				Use <code>GET /api/rotate-new/{`{id}`}/status</code> and <code>POST /api/rotate-new/{`{id}`}/cancel</code>.
				Completed result includes <code>rotationFront</code>, <code>rotationRight</code>, <code>rotationBack</code>, <code>rotationLeft</code>.
			</p>
		</div>

		<!-- Animation -->
		<div class="panel" id="animation">
			<div class="endpoint-header">
				<span class="method-badge method-post">POST</span>
				<code class="endpoint-path">/api/animate/generate</code>
			</div>
			<p class="docs-text">
				Generate frame-by-frame sprite animation with multi-direction support. Token cost varies by animation type and direction count.
				Uses <code>multipart/form-data</code>.
			</p>
			<h3 class="subsection">Form Fields</h3>
			<div class="params-table-wrap">
				<table class="params-table">
					<thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
					<tbody>
						<tr><td><code>animationType</code></td><td>string</td><td>No</td><td><code>walk</code>, <code>run</code>, <code>idle</code>, <code>attack</code> (default: <code>run</code>)</td></tr>
						<tr><td><code>elevation</code></td><td>string</td><td>No</td><td><code>side</code>, <code>low</code>, <code>iso</code>, <code>iso45</code>, <code>topdown</code> (default: <code>iso</code>)</td></tr>
						<tr><td><code>directionCount</code></td><td>number</td><td>No</td><td><code>4</code> or <code>8</code> (default: 4)</td></tr>
						<tr><td><code>image_{`{dir}`}</code></td><td>File</td><td>*</td><td>Image per direction (e.g. <code>image_S</code>, <code>image_NE</code>)</td></tr>
						<tr><td><code>imageUrl_{`{dir}`}</code></td><td>string</td><td>*</td><td>URL per direction (* provide at least one direction)</td></tr>
					</tbody>
				</table>
			</div>
			<div class="note">
				4-dir directions: <code>S</code>, <code>W</code>, <code>N</code>, <code>E</code>.
				8-dir directions: <code>S</code>, <code>SW</code>, <code>W</code>, <code>NW</code>, <code>N</code>, <code>NE</code>, <code>E</code>, <code>SE</code>.
			</div>
			<h3 class="subsection">Status &amp; Cancel</h3>
			<p class="docs-text">
				Use <code>GET /api/animate/{`{id}`}/status</code> and <code>POST /api/animate/{`{id}`}/cancel</code>.
				Completed result includes <code>spritesheetUrl</code>, <code>frameCount</code>, <code>tileWidth</code>, <code>tileHeight</code>.
			</p>
		</div>

		<!-- Workflow -->
		<div class="panel" id="workflow">
			<div class="flex items-center gap-3 mb-4">
				<div class="icon-badge icon-badge-violet">
					<Zap class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Typical Workflow</h2>
					<p class="panel-sub">Generate → Poll → Download</p>
				</div>
			</div>
			<ol class="workflow-steps">
				<li>
					<div class="step-num">1</div>
					<div>
						<strong>Submit</strong> — POST to the generate endpoint. You'll get back a job <code>id</code> with status <code>"pending"</code>.
					</div>
				</li>
				<li>
					<div class="step-num">2</div>
					<div>
						<strong>Poll</strong> — GET the status endpoint every 2–5 seconds. Watch for <code>status</code> to reach <code>"completed"</code> or <code>"failed"</code>.
					</div>
				</li>
				<li>
					<div class="step-num">3</div>
					<div>
						<strong>Download</strong> — When completed, fetch the result URLs (images are publicly accessible).
					</div>
				</li>
			</ol>
			<div class="mt-4">
				<CodeBlock code={workflowExamples} {selectedLang} onLangChange={(l) => selectedLang = l} />
			</div>
		</div>
	</div>
</div>

<Footer />

<style>
	.docs-page { max-width: 56rem; margin: 0 auto; padding: 1.5rem 1rem 0; }

	.page-title {
		font-weight: 800; font-size: 1.35rem; color: #fff;
		margin-bottom: 1.5rem;
	}

	.docs-content { display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 4rem; }

	/* Panels */
	.panel {
		background: var(--panel-bg);
		border: 1px solid var(--panel-border);
		border-radius: var(--panel-radius);
		padding: var(--panel-padding);
		backdrop-filter: var(--panel-blur);
	}
	.panel-heading { font-weight: 700; font-size: 1.05rem; color: #fff; }
	.panel-sub { font-size: .8125rem; color: #71717a; }

	.icon-badge {
		width: 2.5rem; height: 2.5rem;
		border-radius: .6rem;
		display: flex; align-items: center; justify-content: center;
	}
	.icon-badge-amber { background: rgba(245,158,11,.08); color: #fbbf24; }
	.icon-badge-green { background: rgba(74,222,128,.08); color: #4ade80; }
	.icon-badge-blue { background: rgba(96,165,250,.08); color: #60a5fa; }
	.icon-badge-violet { background: rgba(167,139,250,.08); color: #a78bfa; }

	/* Text */
	.docs-text {
		font-size: .875rem; color: #a1a1aa; line-height: 1.6;
	}
	.docs-text code {
		font-size: .8rem;
		background: rgba(63,63,70,.3);
		padding: .1rem .35rem;
		border-radius: .25rem;
		color: #d4d4d8;
	}
	.docs-text strong { color: #fff; font-weight: 600; }
	.docs-link {
		color: #60a5fa; text-decoration: none;
		transition: color .2s;
	}
	.docs-link:hover { color: #93bbfd; }

	/* Base URL */
	.base-url {
		margin-top: 1rem;
		display: flex; align-items: center; gap: .75rem;
		padding: .6rem 1rem;
		background: rgba(9,9,11,.5);
		border: 1px solid rgba(63,63,70,.3);
		border-radius: .5rem;
	}
	.base-url-label {
		font-size: .6875rem; font-weight: 600;
		color: #71717a; text-transform: uppercase;
		letter-spacing: .04em;
	}
	.base-url-value {
		font-size: .875rem; color: #fff;
	}

	/* Notes */
	.note {
		margin-top: .75rem;
		padding: .65rem .85rem;
		background: rgba(96,165,250,.04);
		border: 1px solid rgba(96,165,250,.12);
		border-radius: .5rem;
		font-size: .8125rem; color: #93bbfd;
		line-height: 1.5;
	}
	.note code {
		font-size: .75rem;
		background: rgba(96,165,250,.1);
		padding: .1rem .3rem;
		border-radius: .2rem;
	}

	/* Endpoint header */
	.endpoint-header {
		display: flex; align-items: center; gap: .65rem;
		margin-bottom: .85rem;
	}
	.method-badge {
		padding: .2rem .55rem;
		border-radius: .35rem;
		font-size: .6875rem;
		font-weight: 700;
		letter-spacing: .03em;
	}
	.method-get {
		background: rgba(74,222,128,.1);
		color: #4ade80;
	}
	.method-post {
		background: rgba(96,165,250,.1);
		color: #60a5fa;
	}
	.endpoint-path {
		font-size: .9375rem; font-weight: 600;
		color: #fff;
	}

	.subsection {
		font-size: .8125rem; font-weight: 600;
		color: #a1a1aa;
		margin-top: 1rem; margin-bottom: .25rem;
	}

	/* Params table */
	.params-table-wrap { overflow-x: auto; margin-top: .5rem; }
	.params-table {
		width: 100%; border-collapse: collapse;
		font-size: .8125rem;
	}
	.params-table th {
		text-align: left;
		padding: .45rem .65rem;
		color: #71717a; font-weight: 500;
		border-bottom: 1px solid rgba(63,63,70,.3);
	}
	.params-table td {
		padding: .5rem .65rem;
		border-bottom: 1px solid rgba(63,63,70,.15);
		color: #d4d4d8;
	}
	.params-table code {
		font-size: .75rem;
		background: rgba(63,63,70,.25);
		padding: .1rem .3rem;
		border-radius: .2rem;
		color: #fbbf24;
	}

	/* Error table */
	.error-table-wrap { overflow-x: auto; }
	.error-table {
		width: 100%; border-collapse: collapse;
		font-size: .8125rem;
	}
	.error-table th {
		text-align: left;
		padding: .45rem .65rem;
		color: #71717a; font-weight: 500;
		border-bottom: 1px solid rgba(63,63,70,.3);
	}
	.error-table td {
		padding: .45rem .65rem;
		border-bottom: 1px solid rgba(63,63,70,.15);
		color: #d4d4d8;
	}
	.error-table code {
		font-size: .8rem; font-weight: 600;
		color: #f87171;
	}

	/* Token costs grid */
	.costs-grid {
		display: flex; flex-direction: column; gap: .35rem;
		margin-top: .5rem;
	}
	.cost-row {
		display: flex; align-items: center; gap: .65rem;
		padding: .45rem .65rem;
		border-radius: .45rem;
		transition: background .15s;
	}
	.cost-row:hover { background: rgba(63,63,70,.15); }
	.cost-row-icon {
		width: 1.75rem; height: 1.75rem;
		border-radius: .4rem;
		display: flex; align-items: center; justify-content: center;
		background: rgba(63,63,70,.2);
		color: #a1a1aa;
	}
	.cost-row-name {
		flex: 1;
		font-size: .8125rem; font-weight: 500; color: #d4d4d8;
	}
	.cost-row-amount {
		font-size: .8125rem; font-weight: 600; color: #fbbf24;
		font-family: monospace;
	}

	/* Workflow steps */
	.workflow-steps {
		list-style: none;
		padding: 0; margin: 0;
		display: flex; flex-direction: column; gap: .85rem;
	}
	.workflow-steps li {
		display: flex; align-items: flex-start; gap: .75rem;
		font-size: .875rem; color: #a1a1aa; line-height: 1.5;
	}
	.workflow-steps strong { color: #fff; }
	.workflow-steps code {
		font-size: .75rem;
		background: rgba(63,63,70,.3);
		padding: .1rem .3rem;
		border-radius: .2rem;
		color: #d4d4d8;
	}
	.step-num {
		width: 1.75rem; height: 1.75rem;
		border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		background: rgba(167,139,250,.1);
		color: #a78bfa;
		font-size: .75rem; font-weight: 700;
		flex-shrink: 0;
		margin-top: .1rem;
	}

	.mt-3 { margin-top: .75rem; }
	.mt-4 { margin-top: 1rem; }
	.mb-3 { margin-bottom: .75rem; }
	.mb-4 { margin-bottom: 1rem; }
</style>
