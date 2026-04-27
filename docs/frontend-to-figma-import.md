# Frontend to Figma Import

This is an experimental reverse bridge that creates Figma frames from local frontend/Pencil design data.

Use it when you already have frontend output or a local design payload and want to create editable frames back in Figma.

## Start bridge

```bash
npm run figma:import-bridge
```

Default bridge URL:

```text
http://localhost:4760
```

## Install Figma plugin

In Figma:

1. `Plugins > Development > Import plugin from manifest...`
2. Select `figma-importer-plugin/manifest.json`
3. Run **Figma Pixel Bridge Importer**

The importer reads from `/payload` and creates frames in the current Figma file.

## What to ask AI

Open this project folder in your AI coding tool and say:

```text
把当前前端页面整理成 Figma import payload，然后通过本地 figma:import-bridge 导入到当前 Figma 文件。尽量保留文字、图片、颜色、圆角、尺寸和层级。
```

If the AI tool mentions official Figma MCP quota, tell it:

```text
不要调用官方 Figma MCP。请使用本地 figma:import-bridge 和 Figma Pixel Bridge Importer 插件导入。
```
