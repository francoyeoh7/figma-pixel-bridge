# Figma Pixel Bridge Exporter

Use the plugin bridge when the Figma REST API is rate-limited or when you want a selected-frame export from inside Figma.

## 1. Start the local bridge

```bash
npm run plugin-bridge
```

Default bridge URL:

```text
http://localhost:4758
```

## 2. Install the Figma plugin

In Figma:

1. `Plugins > Development > Import plugin from manifest...`
2. Select `figma-plugin/manifest.json`
3. Run **Figma Pixel Bridge Exporter**

## 3. Export

Select a frame before running the plugin, or choose page scope in the plugin UI.

The bridge writes:

- `public/figma-assets/design-manifest.json`
- `public/figma-assets/images/`
- `public/figma-assets/icons/`
- `public/figma-assets/frames/`
- `generated/figma-preview/index.html`

## 4. Preview

```bash
npm run serve
```

Open:

```text
http://localhost:4173/
```
