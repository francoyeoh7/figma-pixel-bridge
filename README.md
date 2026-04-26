# Figma Pixel Bridge

A local Figma-to-frontend bridge for high-fidelity UI reconstruction. It extracts Figma nodes, exports sharp assets, writes a normalized design manifest, generates a runnable preview, and can self-check visual similarity with a pixel-lock fallback.

## Why this exists

Classic Figma-to-code tools often translate only the node JSON. That misses Figma's final rendered output: image fills, masks, antialiasing, blend/effects, font rendering, and high-resolution exports. This project uses a hybrid pipeline:

1. **Design manifest** for structured nodes, text, colors, radii, typography, components, and geometry.
2. **Asset exporter** for original image fills, SVG icons, and 4x frame exports.
3. **Preview generator** with an editable reconstruction layer plus a pixel-lock layer.
4. **Interaction layer** for hotspots, routes, and motion without destroying visual fidelity.
5. **Visual diff / auto-tune** to keep the final preview above a configurable similarity threshold.

## Requirements

- Node.js 20+
- A Figma Personal Access Token
- Access to the Figma file you want to export

## Quick Start

```bash
git clone <your-repo-url>
cd figma-pixel-bridge
cp .env.example .env.local
# Fill FIGMA_TOKEN and FIGMA_URL in .env.local
npm test
npm run sync
npm run serve
```

Open the preview:

```text
http://localhost:4173/
```

## CLI

You can use the npm scripts or the packaged CLI:

```bash
node scripts/figma-pixel.mjs sync --url "https://www.figma.com/design/...?...node-id=0-1"
node scripts/figma-pixel.mjs serve --port 4173
node scripts/figma-pixel.mjs plugin-bridge --port 4758
node scripts/figma-pixel.mjs verify --threshold 95
node scripts/figma-pixel.mjs auto-tune --threshold 95
node scripts/figma-pixel.mjs mcp
```

If installed globally or used through `npx`, the same commands are available as:

```bash
figma-pixel sync --url "https://www.figma.com/design/...?...node-id=0-1"
figma-pixel serve
figma-pixel plugin-bridge
figma-pixel auto-tune
figma-pixel mcp
```

## Environment

Create `.env.local` from `.env.example`:

```bash
FIGMA_TOKEN=your_figma_personal_access_token
FIGMA_URL=https://www.figma.com/design/FILE_KEY/FILE_NAME?node-id=0-1
FIGMA_FILE_KEY=
FIGMA_NODE_ID=
FIGMA_VISUAL_THRESHOLD=95
```

`.env.local` is ignored by git. Do not commit tokens.

## Outputs

`npm run sync` writes:

- `public/figma-assets/design-manifest.json` - normalized Figma data.
- `public/figma-assets/images/` - original image fills.
- `public/figma-assets/icons/` - SVG vector/icon exports.
- `public/figma-assets/frames/` - high-resolution frame exports.
- `generated/figma-preview/index.html` - runnable local preview.
- `public/figma-assets/sync-summary.json` - export summary.

These runtime outputs are ignored by default so each user can generate them from their own Figma file.

## Figma API flow

```bash
npm run sync
npm run serve
```

This is the fastest path when the Figma API is not rate-limited.

## Figma plugin fallback

Use this when the Figma API is rate-limited or when you want the most faithful selected-frame export from inside Figma:

```bash
npm run plugin-bridge
```

Then in Figma:

1. Open `Plugins > Development > Import plugin from manifest...`
2. Select `figma-plugin/manifest.json`
3. Run **Figma Pixel Bridge Exporter**
4. Select a frame or export the page's top-level frames

The local bridge receives the plugin payload, writes assets, generates the preview, and updates the manifest.

## MCP-style server

Start the stdio server:

```bash
npm run mcp
```

It exposes these tools:

- `figma.sync`
- `figma.analyze`
- `figma.generatePreview`

Example JSON-RPC request:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

## Visual self-check

After a sync/plugin export:

```bash
npm run auto-tune
```

The visual checker compares the generated preview target with the exported Figma frame. If the editable reconstruction is under the threshold, the preview stays in pixel-lock-first mode so visual fidelity remains high.

## Frontend to Figma importer

This repository also contains an experimental reverse bridge for importing local `.pen`/frontend design data back into Figma:

```bash
npm run figma:import-bridge
```

Then install `figma-importer-plugin/manifest.json` in Figma and run **Figma Pixel Bridge Importer**.

## GitHub upload checklist

Before pushing:

```bash
npm test
npm run pack:dry
git status --short
```

Make sure these are not committed:

- `.env.local`
- `.figma-cache/`
- `public/figma-assets/`
- `generated/`
- `reports/`
- root-level one-off screenshots

If a real Figma token was ever pasted into a chat, screenshot, or committed file, revoke it in Figma and create a new token before sharing the repo.
