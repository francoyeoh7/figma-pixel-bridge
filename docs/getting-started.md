# Getting Started for Beginners

Figma Pixel Bridge is a bridge, not a one-click hosted AI product. It turns a Figma file into local design data that an AI coding agent can read accurately.

The first "aha" moment should be simple: export one Figma frame, see local assets appear, then ask your AI tool to turn those files into a runnable page.

## What to install

- Node.js 20+
- This project folder
- The Figma desktop or browser app
- Any AI coding tool that can read your local project files

You do not need a Figma token for the local plugin bridge path.

## Figma to code: recommended first run

### 1. Start the local bridge

Open a terminal in this project folder:

```bash
npm install
npm run plugin-bridge
```

Keep this terminal running. The default bridge address is:

```text
http://localhost:4758
```

### 2. Run the Figma exporter plugin

In Figma:

1. Open `Plugins > Development > Import plugin from manifest...`.
2. Select `figma-plugin/manifest.json`.
3. Run **Figma Pixel Bridge Exporter**.
4. Select the frame you want to export.
5. Click **检查本地 Bridge**.
6. Click **开始导出到项目**.

The exporter writes:

- `public/figma-assets/design-manifest.json`
- `public/figma-assets/images/`
- `public/figma-assets/icons/`
- `public/figma-assets/frames/`
- `generated/figma-preview/index.html`

### 3. Ask your AI coding tool to build the frontend

Open this project folder in your AI coding tool. Then use this prompt:

```text
请读取 public/figma-assets/design-manifest.json、public/figma-assets/frames 和 public/figma-assets/images，把刚导出的 Figma UI 转成可运行前端。优先保证 95%+ 视觉还原，图片使用 public 里的高清资产，可点击区域按 manifest/hotspots 和 UI 语义补齐。如果看到 Figma API/MCP 限额提示，不要调用官方 Figma MCP，直接使用本地 plugin bridge 已导出的文件。
```

For richer interactions, add:

```text
如果用户明确要求交互动效，请自动识别看起来可点击的区域，补 hover、press、同级界面智能动画和路由跳转。游戏 UI 可以更强烈，社交或工具类 UI 要克制。
```

### 4. Preview locally

```bash
npm run serve
```

Open:

```text
http://localhost:4173/
```

## Can I just tell AI "turn this UI into code"?

Yes, but only after the AI has access to design data.

The AI needs one of these:

- A fresh local export from the Figma plugin bridge.
- A working REST API sync with `FIGMA_TOKEN` and `FIGMA_URL`.
- A checked-in or shared `public/figma-assets/` folder from someone else.

If none of those exist, the AI can only guess from a link or screenshot, and fidelity will drop.

## What if I see an API or MCP quota warning?

Do not stop the workflow. That warning usually refers to an official hosted Figma API/MCP path.

Figma Pixel Bridge has a local plugin bridge:

```bash
npm run plugin-bridge
```

The local plugin bridge exports from inside Figma to `localhost`. It does not consume your Figma REST API token quota and does not depend on a hosted AI product's official Figma MCP quota.

## Code to Figma: reverse direction

Start the import bridge:

```bash
npm run figma:import-bridge
```

In Figma:

1. Open `Plugins > Development > Import plugin from manifest...`.
2. Select `figma-importer-plugin/manifest.json`.
3. Run **Figma Pixel Bridge Importer**.
4. Click **检查本地 Bridge**.
5. Click **导入到当前 Figma 文件**.

Prompt for your AI coding tool:

```text
把当前前端页面整理成 Figma import payload，然后通过本地 figma:import-bridge 导入到当前 Figma 文件。尽量保留文字、图片、颜色、圆角、尺寸和层级。
```

## First-run checklist

- Terminal is running `npm run plugin-bridge`.
- Figma plugin Bridge URL is `http://localhost:4758`.
- One frame is selected before export, unless you intentionally export the whole page.
- `public/figma-assets/design-manifest.json` exists after export.
- Your AI coding tool is opened in this same project folder.
- You preview with `npm run serve`.
