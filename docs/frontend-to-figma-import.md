# Frontend to Figma Import

This is an experimental reverse bridge that creates Figma frames from local frontend/Pencil design data.

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
