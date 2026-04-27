# Figma Pixel Bridge Exporter

Use the plugin bridge when the Figma REST API is rate-limited, when a hosted AI tool reports official Figma MCP quota exhaustion, or when you want a selected-frame export from inside Figma.

This is the easiest path for beginners because it does not require a Figma token. The plugin exports the design to local files, then your AI coding tool reads those files from the project folder.

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

## 4. Tell your AI what to do

After export, open this project folder in your AI coding tool and use:

```text
请读取 public/figma-assets/design-manifest.json、public/figma-assets/frames 和 public/figma-assets/images，把刚导出的 Figma UI 转成可运行前端。优先保证 95%+ 视觉还原，图片使用 public 里的高清资产，可点击区域按 manifest/hotspots 和 UI 语义补齐。如果看到 Figma API/MCP 限额提示，不要调用官方 Figma MCP，直接使用本地 plugin bridge 已导出的文件。
```

The important part: the plugin does not run AI by itself. It gives the AI agent accurate local design data.

## 5. Preview

```bash
npm run serve
```

Open:

```text
http://localhost:4173/
```
