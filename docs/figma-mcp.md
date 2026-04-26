# MCP-style Figma Tools

This project includes a small stdio JSON-RPC/MCP-style server for local Figma-to-frontend work.

## Setup

Create `.env.local` in the project root:

```bash
FIGMA_TOKEN=your_figma_personal_access_token
FIGMA_URL=https://www.figma.com/design/FILE_KEY/FILE_NAME?node-id=0-1
# Optional:
FIGMA_FILE_KEY=
FIGMA_NODE_ID=
```

`.env.local` is ignored and must not be committed.

## Commands

```bash
npm test
npm run sync
npm run serve
npm run mcp
```

`npm run sync` writes:

- `public/figma-assets/design-manifest.json` - normalized nodes, colors, radii, fonts, components and asset references.
- `public/figma-assets/images` - original image fills from Figma.
- `public/figma-assets/icons` - SVG exports for vector/icon-like nodes.
- `public/figma-assets/frames` - 4x PNG frame/root exports.
- `generated/figma-preview/index.html` - local preview UI using local assets.

## MCP-style usage

The stdio server accepts JSON-RPC/MCP-style calls:

- `tools/list`
- `tools/call` with `figma.sync`
- `tools/call` with `figma.analyze`
- `tools/call` with `figma.generatePreview`

Example single-line request:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

## Rate-limit fallback: plugin bridge

If `npm run sync` returns a Figma `429 Rate limit exceeded`, use the local plugin bridge instead:

```bash
npm run plugin-bridge
```

Then install `figma-plugin/manifest.json` through Figma `Plugins > Development > Import plugin from manifest...` and run **Figma Pixel Bridge Exporter**. See `docs/figma-plugin-bridge.md` for the complete workflow.

## Visual self-check

After plugin export, run:

```bash
npm run auto-tune
```

This writes `reports/figma-visual-diff` and keeps the preview in pixel-lock-first mode when needed to reach the configured similarity threshold.
