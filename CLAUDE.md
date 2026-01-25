# GenSprite

AI-powered game asset generation platform for sprites, textures, and 8-directional rotations.

## Stack

- **Frontend/Backend**: SvelteKit 2, Svelte 5 (runes), TypeScript
- **Database**: Vercel Postgres (Neon) + Drizzle ORM
- **Image Generation**: ComfyUI workflows (Flux Schnell, SV3D, ControlNet)
- **3D Preview**: Three.js + Threlte
- **Payments**: Paddle (planned)
- **File Storage**: Vercel Blob
- **Deployment**: Vercel

## Core Features

1. **Sprite Generation** — Generate game sprites with transparent backgrounds (2 tokens)
2. **8-Directional Rotation** — Generate sprites in 8 directions from an input image using SV3D (8 tokens)
3. **PBR Texture Generation** — Generate complete texture sets with normal, roughness, metallic, height maps (5 tokens)
4. **3D Material Preview** — Real-time Three.js preview for generated textures

## Project Structure

```
/src
  /lib
    /server
      /db
        index.ts              — Drizzle client
        schema.ts             — Database schema
      auth.ts                 — Session management
      oauth.ts                — GitHub OAuth
    /components
      /three
        MaterialPreview.svelte — 3D texture preview
    pricing.ts                — Token costs and credit packs
  /routes
    +page.svelte              — Landing page
    /app
      +page.svelte            — Sprite generation UI
      /rotate
        +page.svelte          — 8-directional rotation UI (image upload)
      /textures
        +page.svelte          — PBR texture generation UI
      /billing
        +page.svelte          — Token purchase
    /api
      /assets
        generate/+server.ts   — POST: Create sprite
        [id]/status/+server.ts — GET: Check generation status
        [id]/cancel/+server.ts — POST: Cancel & refund
      /rotate
        generate/+server.ts   — POST: Start rotation job (accepts image upload or URL)
        [id]/status/+server.ts — GET: Check rotation progress
      /textures
        generate/+server.ts   — POST: Generate PBR textures
      /billing
        buy-credits/+server.ts — Credit pack purchase
        webhook/+server.ts    — Payment webhook
    /login
      /github                 — GitHub OAuth flow
      /preview                — Demo mode for preview deployments
    /terms                    — Terms of Service
    /privacy                  — Privacy Policy
    /refund                   — Refund Policy
    /pricing                  — Pricing page
```

## Worker Repository

Workflows and job processing are in a separate worker repo (`gensprite-worker`):
- `workflows/sprite.json` — Sprite generation using Flux Schnell + RMBG
- `workflows/rotate_regular.json` — SV3D rotation with ControlNet Tile + IPAdapter refinement

**Rotation Pipeline (SV3D-based):**
1. Upload input image
2. Remove background (RMBG-2.0) with white fill
3. Generate 21 frames with SV3D_Conditioning (configurable elevation angle)
4. Extract 8 evenly-spaced frames for cardinal/ordinal directions
5. 4x upscale with UltraSharp
6. Refine with ControlNet Tile + IPAdapter for consistency
7. Final background removal with alpha transparency

## Database Schema

```typescript
// Users
user: id, email, username, avatarUrl, githubId,
      tokens (default: 50), bonusTokens (default: 0), createdAt

// Sessions
session: id, userId, expiresAt

// Transactions
transaction: id, userId, type ('credit_pack'),
             amount, tokensGranted, status, payCurrency, payAmount

// Asset Generations (sprites)
assetGeneration: id, visibleId, userId, assetType ('sprite' | 'texture'),
                 prompt, width, height, status, progress, currentStage,
                 resultUrls (JSON), seed, tokenCost, createdAt

// Texture Generations (PBR)
textureGeneration: id, userId, prompt, status, progress, currentStage,
                   basecolorUrl, normalUrl, roughnessUrl, metallicUrl, heightUrl,
                   seed, tokenCost, createdAt

// Rotation Jobs (8-directional)
rotationJob: id, userId, status, progress, currentStage,
             inputImageUrl, elevation (default: 20),
             rotationN, rotationNE, rotationE, rotationSE, rotationS, rotationSW,
             rotationW, rotationNW, tokenCost, createdAt
```

## Token System (Pay-as-you-go)

**Token Costs:**
- Sprite: 2 tokens
- Texture (PBR): 5 tokens
- Rotation (8-dir): 8 tokens

**Free Start:**
- 50 tokens on signup (no credit card required)

**Token Packs:**
- Starter: 500 tokens / $10 ($0.02/token)
- Creator: 2,000 tokens / $25 ($0.0125/token, 37% off)
- Studio: 6,000 tokens / $50 ($0.0083/token, 58% off)

Tokens never expire. Failed generations are automatically refunded.

## Environment Variables

```env
POSTGRES_URL=               # Vercel Postgres connection string
BLOB_READ_WRITE_TOKEN=     # Vercel Blob storage token
GITHUB_CLIENT_ID=          # GitHub OAuth
GITHUB_CLIENT_SECRET=
PADDLE_API_KEY=            # Paddle payments (planned)
PADDLE_WEBHOOK_SECRET=
PREVIEW_LOGIN_SECRET=      # Secret for preview deployment login
```

## Development Commands

```bash
pnpm dev                    # Start dev server
pnpm db:generate           # Generate Drizzle migrations
pnpm db:migrate            # Run migrations
pnpm db:studio             # Open Drizzle Studio
```

## Key Implementation Notes

- Tokens are deducted before generation starts, refunded on cancellation
- All token purchases go to `bonusTokens` (never expire)
- Rotation accepts image upload (drag/drop, file picker) or existing sprite URL
- Elevation parameter controls camera angle for rotation (-90° to 90°, default 20°)
- 3D preview uses Threlte (Svelte Three.js wrapper)
- Status polling every 2 seconds for generation progress
- Worker runs separately and polls for pending jobs
