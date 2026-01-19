# Zephyr

AI image generation platform using Z-Image Turbo with custom LoRA support.

## Stack

- **Frontend/Backend**: SvelteKit 2 (TypeScript)
- **Database**: Vercel Postgres (Neon) + Drizzle ORM
- **Image Generation**: fal.ai Z-Image Turbo
- **File Storage**: fal.ai storage for LoRA files
- **Deployment**: Vercel

## Core Features

1. **Text-to-Image Generation** — Generate images using Z-Image Turbo via fal.ai
2. **Custom LoRA Support** — Users can upload and apply their own LoRA files (.safetensors)
3. **LoRA Library** — Users manage a personal library of uploaded LoRAs
4. **Generation History** — Track past generations with prompts and settings

## Key APIs

### fal.ai Endpoints
- `fal-ai/z-image/turbo` — Base text-to-image ($0.005/MP)
- `fal-ai/z-image/turbo/lora` — Text-to-image with LoRA support ($0.0085/MP)
- `fal.storage.upload(file)` — Upload files to fal.ai storage, returns URL

### fal.ai LoRA Usage
```typescript
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/z-image/turbo/lora", {
  input: {
    prompt: "...",
    loras: [
      { path: "https://...", scale: 0.8 }  // max 3 LoRAs
    ],
    image_size: { width: 1024, height: 768 },
    num_inference_steps: 8,  // 1-8, default 8
    seed: 12345,  // optional, for reproducibility
    num_images: 1  // 1-4
  }
});
```

## Project Structure

```
/src
  /lib
    /server
      db.ts          — Drizzle client
      schema.ts      — Database schema
      fal.ts         — fal.ai client setup
    /components      — Svelte components
  /routes
    +page.svelte     — Main generation UI
    +layout.svelte   — App layout
    /api
      /generate/+server.ts   — Image generation endpoint
      /loras/+server.ts      — LoRA CRUD operations
      /upload/+server.ts     — LoRA file upload
```

## Database Schema (Drizzle)

```typescript
// Users (if adding auth later)
users: id, email, createdAt

// LoRAs
loras: id visibleId, name, falUrl, userId, createdAt

// Generations
generations: id visibleId, prompt, imageUrl, loraIds[], seed, userId, createdAt
```

## Environment Variables

```env
FAL_KEY=                    # fal.ai API key
POSTGRES_URL=               # Vercel Postgres connection string
```

## Development Commands

```bash
pnpm dev                    # Start dev server
pnpm db:generate           # Generate Drizzle migrations
pnpm db:migrate            # Run migrations
pnpm db:studio             # Open Drizzle Studio
```

## Notes

- LoRA files are .safetensors, typically 10-200MB
- fal.ai storage URLs are temporary — consider if long-term storage needed
- Z-Image Turbo supports English and Chinese text rendering in images
- Max 3 LoRAs can be combined per generation
- Image sizes: use standard aspects (1024x1024, 1024x768, 768x1024, etc.)