export function buildCssStyleForNode(node) {
  const box = node.box ?? { x: 0, y: 0, width: 0, height: 0 };
  const styles = [
    'position:absolute',
    `left:${px(box.x)}`,
    `top:${px(box.y)}`,
    `width:${px(box.width)}`,
    `height:${px(box.height)}`,
    'box-sizing:border-box',
  ];

  if (node.opacity !== undefined) styles.push(`opacity:${node.opacity}`);
  if (node.fill && !node.asset) styles.push(`background:${node.fill}`);
  if (node.radius !== undefined) styles.push(`border-radius:${radiusToCss(node.radius)}`);
  if (node.stroke) styles.push(`border:${px(node.strokeWeight ?? 1)} solid ${node.stroke}`);
  if (node.effects?.length) {
    const shadows = node.effects
      .filter((effect) => ['DROP_SHADOW', 'INNER_SHADOW'].includes(effect.type))
      .map((effect) => `${effect.type === 'INNER_SHADOW' ? 'inset ' : ''}${px(effect.offset?.x ?? 0)} ${px(effect.offset?.y ?? 0)} ${px(effect.radius ?? 0)} ${px(effect.spread ?? 0)} ${effect.color ?? 'rgba(0,0,0,.25)'}`);
    if (shadows.length) styles.push(`box-shadow:${shadows.join(',')}`);
  }

  if (node.type === 'TEXT' && node.font) {
    styles.push('background:transparent');
    styles.push(`color:${node.fill || '#fff'}`);
    styles.push(`font-family:"${escapeCssString(node.font.family)}"`);
    if (node.font.size) styles.push(`font-size:${px(node.font.size)}`);
    if (node.font.weight) styles.push(`font-weight:${node.font.weight}`);
    if (node.font.lineHeight) styles.push(`line-height:${px(node.font.lineHeight)}`);
    if (node.font.letterSpacing) styles.push(`letter-spacing:${px(node.font.letterSpacing)}`);
    if (node.font.align) styles.push(`text-align:${node.font.align.toLowerCase()}`);
    styles.push('white-space:pre-wrap');
    styles.push('overflow:visible');
  } else if (node.type === 'ELLIPSE') {
    styles.push('border-radius:9999px');
  } else {
    styles.push('overflow:hidden');
  }

  return styles.join(';');
}

const ROUTES = [
  { id: 'home', label: 'Play', cn: '部署总览', key: '01' },
  { id: 'loadout', label: 'armament', cn: '枪匠系统', key: '02' },
  { id: 'inventory', label: 'warehouse', cn: '战备高墙', key: '03' },
  { id: 'research', label: 'R&D', cn: '科技研发', key: '04' },
  { id: 'medical', label: 'medbay', cn: '医疗全息', key: '05' },
  { id: 'map', label: 'store', cn: '战区沙盘', key: '06' },
];

export function generatePreviewHtml(manifest) {
  const screens = normalizeScreens(manifest).sort((a, b) => routeSortValue(a.route) - routeSortValue(b.route));
  const figmaRoutes = new Set(screens.map((screen) => screen.route));
  const appScreens = [
    ...screens.map((screen) => ({ kind: 'figma', route: screen.route, title: screen.name, screen })),
    ...ROUTES.filter((route) => !figmaRoutes.has(route.id)).map((route) => ({ kind: 'generated', route: route.id, title: route.cn })),
  ];
  const interactionConfig = resolveInteractionConfig(manifest, screens);
  const firstRoute = appScreens[0]?.route ?? 'home';
  const routeLabels = Object.fromEntries(appScreens.map((item) => [item.route, item.title]));
  const title = `Figma Preview - ${screens[0]?.name ?? manifest.root?.name ?? 'METAWAR'}`;
  const rootSize = screens[0]?.root?.size ?? manifest.root?.size ?? { width: 1440, height: 900 };
  const bgAsset = findAsset(manifest, /背景|factory|rain/i) ?? screens[0]?.exactExports?.png?.publicPath ?? '';
  const heroAsset = findAsset(manifest, /jimeng|人物|角色|character/i) ?? '';
  const bodyClass = [
    'mode-exact',
    interactionConfig.autoInteractions ? 'auto-interactions' : '',
    `interaction-profile-${interactionConfig.profile}`,
  ].filter(Boolean).join(' ');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --stage-w:${px(rootSize.width ?? 1440)};
      --stage-h:${px(rootSize.height ?? 900)};
      --bg-base:#020406;
      --panel:rgba(0,0,0,.46);
      --panel-strong:rgba(2,10,15,.74);
      --line:rgba(255,255,255,.13);
      --line-hot:rgba(255,255,0,.62);
      --text:#fff;
      --muted:#8b92a5;
      --acid:#ffff00;
      --cyan:#00f0ff;
      --red:#ff2a40;
      --bg-url:${bgAsset ? `url('${escapeCssUrl(bgAsset)}')` : 'none'};
      --hero-url:${heroAsset ? `url('${escapeCssUrl(heroAsset)}')` : 'none'};
      --ease:cubic-bezier(.16,1,.3,1);
    }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:#020406; color:var(--text); font-family:Rajdhani,"Space Grotesk",system-ui,sans-serif; overflow:hidden; }
    button { font:inherit; }
    .preview-shell { min-height:100vh; width:100vw; position:relative; overflow:hidden; }
    .canvas-wrap { position:fixed; inset:0; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#020406; }
    .stage-viewport { position:relative; width:var(--stage-w); height:var(--stage-h); flex:0 0 auto; }
    .stage-stack { position:absolute; left:0; top:0; width:var(--stage-w); height:var(--stage-h); min-width:var(--stage-w); min-height:var(--stage-h); transform-origin:top left; will-change:transform; }
    .metawar-screen { position:absolute; inset:0; opacity:0; visibility:hidden; transform:translate3d(18px,0,0) scale(.992); transition:opacity .34s var(--ease), transform .34s var(--ease), visibility .34s; }
    body.route-instant .metawar-screen { transition:none !important; }
    .metawar-screen.active { opacity:1; visibility:visible; transform:translate3d(0,0,0) scale(1); }
    .figma-stage, .generated-stage { position:absolute; inset:0; width:var(--stage-w); height:var(--stage-h); min-width:var(--stage-w); min-height:var(--stage-h); background:#020406; box-shadow:0 30px 90px rgba(0,0,0,.55); transform-origin:top left; overflow:hidden; }
    .figma-node { margin:0; }
    .figma-node img { display:block; width:100%; height:100%; object-fit:cover; }
    .exact-layer, .editable-layer, .interaction-layer, .fx-layer { position:absolute; inset:0; width:100%; height:100%; }
    .exact-layer { display:none; z-index:2; }
    .exact-layer img, .exact-layer object { width:100%; height:100%; display:block; object-fit:contain; }
    .editable-layer { z-index:1; }
    .interaction-layer { z-index:7; pointer-events:none; }
    .fx-layer { z-index:6; pointer-events:none; mix-blend-mode:screen; }
    body.mode-exact .editable-layer { display:none; }
    body.mode-exact .exact-layer { display:block; }
    .hotspot { position:absolute; border:1px solid transparent; background:rgba(255,255,0,0); pointer-events:auto; cursor:crosshair; overflow:hidden; isolation:isolate; contain:paint; transition:border-color .18s var(--ease), background .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease), filter .18s var(--ease); will-change:transform, box-shadow; }
    .hotspot::before { content:""; position:absolute; inset:-1px; z-index:-1; pointer-events:none; opacity:0; background:linear-gradient(105deg, transparent 0 36%, rgba(255,255,255,.4) 46%, transparent 58%); transform:translateX(-120%); mix-blend-mode:screen; }
    .hotspot::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:0; border:1px solid rgba(255,255,0,.72); box-shadow:inset 0 0 0 1px rgba(0,0,0,.45), 0 0 22px rgba(255,255,0,.2); transform:scale(.985); transition:opacity .18s var(--ease), transform .18s var(--ease); }
    .hotspot:hover, .hotspot:focus-visible { border-color:var(--line-hot); background:rgba(255,255,0,.09); box-shadow:0 0 0 1px rgba(0,0,0,.45), 0 0 24px rgba(255,255,0,.22); outline:0; transform:translateY(-1px); filter:brightness(1.06); }
    .hotspot:hover::before, .hotspot:focus-visible::before { opacity:1; animation:hotspotGlint .72s var(--ease) both; }
    .hotspot:hover::after, .hotspot:focus-visible::after { opacity:1; transform:scale(1); }
    .hotspot:active, .hotspot.is-pressed { transform:translateY(0) scale(.986); background:rgba(255,255,0,.16); filter:brightness(1.18); }
    .hotspot[data-kind="primary"]:hover { background:rgba(255,255,0,.18); box-shadow:0 0 38px rgba(255,255,0,.34); }
    .feedback-hotspot { cursor:pointer; }
    .feedback-hotspot:hover, .feedback-hotspot:focus-visible { border-color:rgba(0,240,255,.46); background:rgba(0,240,255,.055); box-shadow:0 0 0 1px rgba(0,0,0,.42), 0 0 20px rgba(0,240,255,.18); }
    .feedback-hotspot::after { border-color:rgba(0,240,255,.48); box-shadow:inset 0 0 0 1px rgba(0,0,0,.38), 0 0 20px rgba(0,240,255,.16); }
    .feedback-hotspot .hotspot-label { background:var(--cyan); color:#001114; }
    .hotspot-label { position:absolute; left:8px; top:6px; opacity:0; color:#050505; background:var(--acid); font:700 10px/1.1 "JetBrains Mono",monospace; letter-spacing:.08em; padding:4px 6px; transform:translateY(-4px); transition:.18s var(--ease); }
    .hotspot:hover .hotspot-label { opacity:1; transform:translateY(0); }
    body.show-hotspots .metawar-screen.active .hotspot { border-color:rgba(255,255,0,.68); background:rgba(255,255,0,.07); box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 18px rgba(255,255,0,.16); }
    body.show-hotspots .metawar-screen.active .hotspot[data-kind="gunsmith"] { border-color:rgba(255,255,0,.94); background:rgba(255,255,0,.12); box-shadow:0 0 0 1px rgba(0,0,0,.55), 0 0 30px rgba(255,255,0,.28); }
    body.show-hotspots .metawar-screen.active .feedback-hotspot { border-color:rgba(0,240,255,.28); background:rgba(0,240,255,.025); box-shadow:0 0 0 1px rgba(0,0,0,.42), 0 0 14px rgba(0,240,255,.08); }
    body.show-hotspots .metawar-screen.active .hotspot-label { opacity:1; transform:translateY(0); }
    body.show-hotspots .metawar-screen.active .feedback-hotspot .hotspot-label { opacity:0; transform:translateY(-4px); }
    body.show-hotspots .metawar-screen.active .feedback-hotspot:hover .hotspot-label, body.show-hotspots .metawar-screen.active .feedback-hotspot:focus-visible .hotspot-label { opacity:1; transform:translateY(0); }
    body.interaction-profile-game .feedback-hotspot:hover, body.interaction-profile-game .feedback-hotspot:focus-visible { transform:translateY(-2px) scale(1.012); border-color:rgba(255,255,0,.62); background:rgba(255,255,0,.075); box-shadow:0 0 0 1px rgba(0,0,0,.44), 0 0 28px rgba(255,255,0,.2), inset 0 0 18px rgba(0,240,255,.07); }
    body.interaction-profile-game .feedback-hotspot:hover::before, body.interaction-profile-game .feedback-hotspot:focus-visible::before { opacity:1; animation:hotspotGlint .58s var(--ease) both; }
    body.interaction-profile-social .hotspot:hover, body.interaction-profile-social .hotspot:focus-visible, body.interaction-profile-social .feedback-hotspot:hover, body.interaction-profile-social .feedback-hotspot:focus-visible { cursor:pointer; transform:translateY(-1px); border-color:rgba(255,255,255,.34); background:rgba(255,255,255,.055); box-shadow:0 10px 28px rgba(0,0,0,.18); filter:brightness(1.02); }
    body.interaction-profile-social .hotspot::before, body.interaction-profile-social .feedback-hotspot::before { display:none; }
    body.interaction-profile-social .hotspot::after, body.interaction-profile-social .feedback-hotspot::after { border-color:rgba(255,255,255,.38); box-shadow:0 0 0 1px rgba(255,255,255,.08); }
    body.interaction-profile-product .feedback-hotspot:hover, body.interaction-profile-product .feedback-hotspot:focus-visible { cursor:pointer; transform:translateY(-1px); border-color:rgba(0,240,255,.34); background:rgba(0,240,255,.045); box-shadow:0 0 0 1px rgba(0,0,0,.34), 0 12px 26px rgba(0,0,0,.18); }
    .rain-field::before, .rain-field::after { content:""; position:absolute; inset:-25% 0; background:repeating-linear-gradient(105deg, transparent 0 26px, rgba(255,255,255,.12) 27px 28px, transparent 29px 60px); opacity:.22; animation:rainDrift 1.4s linear infinite; }
    .rain-field::after { opacity:.11; animation-duration:2.1s; transform:scaleX(-1); }
    .scan-sweep { position:absolute; left:-20%; right:-20%; top:-8%; height:18%; background:linear-gradient(180deg, transparent, rgba(0,240,255,.12), transparent); animation:scanSweep 5.8s var(--ease) infinite; }
    .boot-flash { position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); transform:translateX(-120%); animation:bootFlash .9s var(--ease) .15s both; }
    .transition-wipe { position:fixed; inset:0; z-index:40; pointer-events:none; background:linear-gradient(90deg, transparent, rgba(255,255,0,.34), transparent); transform:translateX(-120%); opacity:0; }
    body.is-switching .transition-wipe { animation:wipe .48s var(--ease); }
    .scope-reveal-overlay { position:absolute; inset:0; z-index:24; pointer-events:none; overflow:hidden; opacity:1; contain:paint; }
    .scope-reveal-next { position:absolute; inset:0; opacity:0; transform:translate3d(0,0,0) scale(1); filter:brightness(1.04) contrast(1.02) blur(0); will-change:opacity, filter; }
    .scope-reveal-next img { display:block; width:100%; height:100%; object-fit:contain; }
    .scope-reveal-haze { position:absolute; inset:-18%; background:radial-gradient(circle at var(--focus-cx, 78%) var(--focus-cy, 35%), rgba(255,255,255,.24), transparent 11%), radial-gradient(circle at var(--focus-cx, 78%) var(--focus-cy, 35%), rgba(255,255,0,.2), transparent 23%), linear-gradient(96deg, transparent 0 33%, rgba(255,255,255,.16) 48%, transparent 66%); mix-blend-mode:screen; opacity:0; transform:translateX(-6%); will-change:opacity, transform; }
    .scope-reveal-focus { position:absolute; left:var(--focus-left, 72%); top:var(--focus-top, 24%); width:var(--focus-width, 110px); height:var(--focus-height, 120px); border:1px solid rgba(255,255,0,.9); background:rgba(255,255,0,.07); box-shadow:0 0 0 1px rgba(0,0,0,.48), 0 0 32px rgba(255,255,0,.24), inset 0 0 20px rgba(255,255,255,.1); opacity:0; transform:scale(.96); will-change:opacity, transform; }
    .scope-reveal-scan { position:absolute; left:-8%; right:-8%; top:0; height:1px; background:rgba(0,240,255,.55); box-shadow:0 0 18px rgba(0,240,255,.48); opacity:0; will-change:opacity, transform; }
    .scope-reveal-overlay.is-playing .scope-reveal-next { animation:scopeRevealNext .78s var(--ease) both; }
    .scope-reveal-overlay.is-playing .scope-reveal-haze { animation:scopeRevealHaze .86s var(--ease) both; }
    .scope-reveal-overlay.is-playing .scope-reveal-focus { animation:scopeRevealFocus .74s var(--ease) both; }
    .scope-reveal-overlay.is-playing .scope-reveal-scan { animation:scopeRevealScan .82s var(--ease) both; }
    .scope-reveal-overlay.is-settling { animation:scopeRevealSettle .26s var(--ease) both; }
    .smart-morph-overlay { position:absolute; inset:0; z-index:8; pointer-events:none; overflow:hidden; opacity:1; contain:paint; }
    .smart-morph-before { position:absolute; inset:0; background-position:center; background-size:contain; background-repeat:no-repeat; opacity:.88; transform:scale(1); filter:brightness(.96) contrast(1.02) blur(0); animation:smartMorphBefore 1.48s var(--ease) both; }
    .smart-morph-haze { position:absolute; inset:-18%; background:radial-gradient(circle at var(--focus-cx, 72%) var(--focus-cy, 38%), rgba(255,255,255,.34), transparent 10%), radial-gradient(circle at var(--focus-cx, 72%) var(--focus-cy, 38%), rgba(255,255,0,.18), transparent 24%), linear-gradient(95deg, transparent 0 30%, rgba(255,255,255,.18) 48%, transparent 68%); mix-blend-mode:screen; opacity:0; transform:translateX(-7%); animation:smartMorphHaze 1.58s var(--ease) both; }
    .smart-morph-focus { position:absolute; left:var(--focus-left, 68%); top:var(--focus-top, 24%); width:var(--focus-width, 120px); height:var(--focus-height, 80px); border:1px solid rgba(255,255,0,.88); background:rgba(255,255,0,.08); box-shadow:0 0 0 1px rgba(0,0,0,.48), 0 0 36px rgba(255,255,0,.28), inset 0 0 22px rgba(255,255,255,.1); opacity:0; transform:scale(.94); animation:smartMorphFocus 1.42s var(--ease) both; }
    .smart-morph-scan { position:absolute; left:-10%; right:-10%; top:0; height:1px; background:rgba(0,240,255,.62); box-shadow:0 0 20px rgba(0,240,255,.52); opacity:0; animation:smartMorphScan 1.46s var(--ease) both; }
    .ripple { position:absolute; width:12px; height:12px; border-radius:999px; background:rgba(255,255,255,.45); pointer-events:none; transform:translate(-50%,-50%) scale(1); animation:ripple .5s var(--ease) forwards; }

    .generated-stage { isolation:isolate; padding:34px 60px 40px; background:#020406; }
    .generated-stage::before { content:""; position:absolute; inset:0; z-index:-3; background:linear-gradient(90deg, rgba(0,0,0,.86), rgba(0,0,0,.28) 48%, rgba(0,0,0,.78)), var(--bg-url) center/cover no-repeat; filter:contrast(1.12) brightness(.72) saturate(.78); }
    .generated-stage::after { content:""; position:absolute; inset:0; z-index:-2; background:radial-gradient(circle at 70% 22%, rgba(255,255,255,.18), transparent 24%), repeating-linear-gradient(180deg, rgba(255,255,255,.018) 0 2px, transparent 2px 6px); opacity:.82; pointer-events:none; }
    .gen-header, .gen-footer { display:flex; align-items:center; justify-content:space-between; position:relative; z-index:3; }
    .gen-logo { font-family:"Space Grotesk",sans-serif; font-weight:900; font-size:26px; letter-spacing:2px; }
    .gen-logo small { color:var(--acid); font:800 10px/1 "JetBrains Mono",monospace; margin-left:10px; letter-spacing:.08em; }
    .gen-nav { display:flex; gap:0; background:rgba(28,40,47,.86); border:1px solid rgba(255,255,255,.08); height:27px; }
    .gen-nav button { min-width:112px; border:0; color:white; background:transparent; cursor:pointer; font:800 10px/1 "JetBrains Mono",monospace; letter-spacing:.03em; transition:.2s var(--ease); }
    .gen-nav button.active, .gen-nav button:hover { background:rgba(255,255,0,.6); color:#050505; }
    .wallet { text-align:right; font:800 12px/1.35 "JetBrains Mono",monospace; color:white; }
    .wallet span { display:block; color:var(--muted); font-size:9px; }
    .gen-content { position:relative; z-index:2; height:690px; margin-top:32px; }
    .gen-footer { gap:25px; position:absolute; left:60px; right:60px; bottom:40px; }
    .hud-btn { position:relative; overflow:hidden; height:81px; flex:1; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.42); color:white; text-align:left; padding:18px 20px; cursor:pointer; clip-path:polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%); transition:.25s var(--ease); }
    .hud-btn strong { display:block; font-size:20px; letter-spacing:.04em; }
    .hud-btn span { display:block; color:var(--muted); font:800 11px/1 "JetBrains Mono",monospace; letter-spacing:.1em; margin-bottom:9px; }
    .hud-btn:hover { transform:translateY(-7px); border-color:var(--acid); box-shadow:0 18px 36px rgba(0,0,0,.5), 0 0 24px rgba(255,255,0,.12); }
    .hud-btn.primary { flex:0 0 300px; height:103px; color:#050505; background:var(--acid); border-color:var(--acid); }
    .hud-btn.primary span { color:rgba(0,0,0,.65); }
    .panel-title { margin:0 0 16px; font-family:"Space Grotesk",sans-serif; font-size:44px; line-height:.95; letter-spacing:.02em; text-transform:uppercase; }
    .micro { color:var(--acid); font:800 12px/1.4 "JetBrains Mono",monospace; letter-spacing:.14em; }
    .glass { border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.46); backdrop-filter:blur(12px); box-shadow:0 22px 48px rgba(0,0,0,.38); clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px); }
    .loadout-grid, .inventory-grid, .research-grid, .medical-grid, .map-grid { display:grid; gap:24px; height:100%; }
    .loadout-grid { grid-template-columns:320px 1fr 330px; align-items:center; }
    .weapon-card { padding:24px; }
    .bar { margin:0 0 22px; }
    .bar label { display:flex; justify-content:space-between; color:white; font:800 11px/1 "JetBrains Mono",monospace; margin-bottom:8px; }
    .bar i { display:block; height:6px; background:rgba(255,255,255,.12); overflow:hidden; }
    .bar i::before { content:""; display:block; width:var(--w); height:100%; background:var(--c,var(--cyan)); box-shadow:0 0 12px var(--c,var(--cyan)); animation:barIn .9s var(--ease) both; }
    .weapon-hero { display:grid; place-items:center; min-height:420px; color:white; }
    .weapon-hero::before { content:"MK-14"; position:absolute; font:900 180px/.8 "Space Grotesk",sans-serif; opacity:.06; }
    .weapon-sil { width:78%; height:72px; background:linear-gradient(90deg,#151b1f,#9ba5a8 42%,#21282c); clip-path:polygon(0 42%,62% 42%,66% 0,74% 0,76% 42%,100% 42%,100% 58%,72% 58%,69% 100%,61% 100%,58% 58%,0 58%); filter:drop-shadow(0 25px 26px rgba(0,0,0,.8)); animation:floatWeapon 4.8s ease-in-out infinite; }
    .part-list { display:grid; gap:14px; }
    .part { padding:15px; display:flex; gap:14px; cursor:pointer; transition:.22s var(--ease); }
    .part:hover, .part.selected { border-color:var(--cyan); background:rgba(0,240,255,.11); transform:translateX(-8px); }
    .part b { display:grid; place-items:center; width:42px; height:42px; color:var(--cyan); border:1px solid rgba(0,240,255,.28); font:800 13px/1 "JetBrains Mono",monospace; }
    .inventory-grid { grid-template-columns:1fr 330px; }
    .stash { display:grid; grid-template-columns:repeat(14,1fr); grid-auto-rows:52px; gap:5px; padding:18px; background:rgba(3,7,9,.82); border:1px solid rgba(255,255,255,.14); }
    .wall-item { padding:8px; border:1px solid rgba(255,255,255,.18); background:linear-gradient(135deg,rgba(40,45,50,.88),rgba(10,14,17,.9)); cursor:pointer; transition:.18s var(--ease); font:800 10px/1.2 "JetBrains Mono",monospace; color:white; }
    .wall-item:hover, .wall-item.selected { transform:scale(1.035); border-color:var(--acid); box-shadow:0 0 22px rgba(255,255,0,.16); z-index:5; }
    .x6 { grid-column:span 6; grid-row:span 2; } .x3 { grid-column:span 3; grid-row:span 2; } .x2 { grid-column:span 2; grid-row:span 2; } .x1 { grid-column:span 1; grid-row:span 1; }
    .research-grid { grid-template-columns:repeat(3,1fr); align-content:center; }
    .tech-node { min-height:220px; padding:24px; cursor:pointer; transition:.22s var(--ease); }
    .tech-node:hover, .tech-node.unlocked { border-color:var(--acid); background:rgba(255,255,0,.08); transform:translateY(-8px); }
    .tech-node .idx { color:var(--acid); font:900 44px/.9 "Space Grotesk",sans-serif; opacity:.8; }
    .medical-grid { grid-template-columns:1fr 370px; align-items:center; }
    .body-scan { width:380px; height:590px; margin:auto; border:1px solid rgba(0,240,255,.3); background:linear-gradient(180deg,rgba(0,240,255,.08),transparent), var(--hero-url) center/contain no-repeat; filter:grayscale(1) hue-rotate(145deg) saturate(2); position:relative; }
    .body-scan::after { content:""; position:absolute; left:-20px; right:-20px; height:4px; background:var(--cyan); box-shadow:0 0 24px var(--cyan); animation:bodyScan 3.6s ease-in-out infinite alternate; }
    .medical-actions { display:grid; gap:14px; }
    .med-btn { padding:22px; color:var(--cyan); border:1px solid var(--cyan); background:rgba(0,240,255,.08); cursor:pointer; transition:.22s var(--ease); font-weight:900; letter-spacing:.04em; }
    .med-btn:hover { background:var(--cyan); color:#001114; transform:translateY(-5px); }
    .map-grid { grid-template-columns:repeat(3,1fr); align-items:center; }
    .map-card { height:500px; padding:24px; display:flex; align-items:flex-end; cursor:pointer; background:linear-gradient(180deg,transparent,rgba(0,0,0,.85)), var(--bg-url) center/cover; filter:grayscale(.75); transition:.32s var(--ease); }
    .map-card:hover, .map-card.selected { filter:grayscale(0); transform:translateY(-12px); border-color:var(--cyan); box-shadow:0 26px 52px rgba(0,0,0,.55); }
    .ops-log { margin-top:18px; min-height:96px; padding:12px; color:#9da8b8; font:12px/1.5 "JetBrains Mono",monospace; white-space:pre-wrap; }
    .inspect-panel { position:fixed; z-index:55; right:16px; top:16px; bottom:16px; width:min(380px,calc(100vw - 32px)); overflow:auto; padding:24px; background:rgba(8,10,14,.96); border:1px solid rgba(255,255,255,.12); box-shadow:0 24px 80px rgba(0,0,0,.56); transform:translateX(calc(100% + 24px)); visibility:hidden; pointer-events:none; transition:transform .28s var(--ease); }
    body.show-inspector .inspect-panel { transform:translateX(0); visibility:visible; pointer-events:auto; }
    .inspect-panel h1 { font-size:18px; margin:0 0 16px; }
    .inspect-panel h2 { font-size:12px; margin:24px 0 8px; text-transform:uppercase; letter-spacing:.12em; color:#8aa0b7; }
    .chip-list { display:flex; flex-wrap:wrap; gap:8px; }
    .chip { border:1px solid rgba(255,255,255,.14); border-radius:999px; padding:5px 9px; font-size:12px; background:rgba(255,255,255,.05); }
    .node-meta { margin-top:16px; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; color:#9da8b8; white-space:pre-wrap; }
    .mode-toggle, .screen-tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:14px 0; }
    .screen-tabs { grid-template-columns:1fr; }
    .mode-toggle button, .screen-tabs button { border:1px solid rgba(255,255,255,.16); border-radius:9px; background:rgba(255,255,255,.06); color:#fff; padding:8px 10px; cursor:pointer; text-align:left; transition:.18s var(--ease); }
    .mode-toggle button.active, .screen-tabs button.active { background:#ffff00; color:#050505; border-color:#ffff00; font-weight:900; }
    @keyframes rainDrift { to { transform:translate3d(-34px,140px,0); } }
    @keyframes scanSweep { 0%,100% { transform:translateY(-20%); opacity:.08; } 45%,55% { opacity:.45; } 50% { transform:translateY(650%); } }
    @keyframes bootFlash { to { transform:translateX(120%); } }
    @keyframes wipe { 0% { opacity:0; transform:translateX(-120%); } 15%,80% { opacity:1; } 100% { opacity:0; transform:translateX(120%); } }
    @keyframes scopeRevealNext { 0% { opacity:0; filter:brightness(1.18) contrast(1.05) blur(4px); } 22% { opacity:.32; filter:brightness(1.12) contrast(1.04) blur(1.4px); } 72%,100% { opacity:1; filter:brightness(1) contrast(1) blur(0); } }
    @keyframes scopeRevealHaze { 0% { opacity:0; transform:translateX(-7%); } 24%,58% { opacity:.82; } 100% { opacity:0; transform:translateX(7%); } }
    @keyframes scopeRevealFocus { 0% { opacity:0; transform:scale(.96); } 16%,62% { opacity:.96; transform:scale(1); } 100% { opacity:0; transform:scale(1.035); } }
    @keyframes scopeRevealScan { 0% { opacity:0; transform:translateY(14px); } 12% { opacity:.7; } 100% { opacity:0; transform:translateY(72vh); } }
    @keyframes scopeRevealSettle { to { opacity:0; } }
    @keyframes smartMorphBefore { 0% { opacity:.88; transform:scale(1); filter:brightness(.96) contrast(1.02) blur(0); } 38% { opacity:.46; filter:brightness(1.08) contrast(1.06) blur(.5px); } 100% { opacity:0; transform:scale(1.006); filter:brightness(.78) contrast(1) blur(7px); } }
    @keyframes smartMorphHaze { 0% { opacity:0; transform:translateX(-8%); } 24%,68% { opacity:.82; } 100% { opacity:0; transform:translateX(8%); } }
    @keyframes smartMorphFocus { 0% { opacity:0; transform:scale(.94); } 18%,72% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1.035); } }
    @keyframes smartMorphScan { 0% { opacity:0; transform:translateY(8px); } 15% { opacity:.78; } 100% { opacity:0; transform:translateY(78vh); } }
    @keyframes hotspotGlint { to { transform:translateX(120%); } }
    @keyframes ripple { to { transform:translate(-50%,-50%) scale(24); opacity:0; } }
    @keyframes barIn { from { transform:scaleX(0); transform-origin:left; } }
    @keyframes floatWeapon { 50% { transform:translateY(-16px); } }
    @keyframes bodyScan { from { top:6%; } to { top:92%; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; } }
    @media (max-width: 900px) { .inspect-panel { right:10px; top:10px; bottom:10px; width:calc(100vw - 20px); } }
  </style>
</head>
<body class="${escapeHtml(bodyClass)}" data-active-route="${escapeHtml(firstRoute)}" data-interaction-profile="${escapeHtml(interactionConfig.profile)}" data-auto-interactions="${interactionConfig.autoInteractions ? 'true' : 'false'}">
  <div class="transition-wipe"></div>
  <div class="preview-shell">
    <div class="canvas-wrap">
      <div class="stage-viewport">
        <div class="stage-stack" aria-label="METAWAR interactive preview">
${appScreens.map((item, index) => item.kind === 'figma' ? renderPixelScreen(item.screen, index === 0, interactionConfig, screens) : renderGeneratedScreen(item.route, index === 0)).join('\n')}
        </div>
      </div>
    </div>
    <aside class="inspect-panel" aria-hidden="true">
      <h1>METAWAR 转译预览</h1>
      <div class="mode-toggle"><button id="editableMode">可编辑重建</button><button id="exactMode" class="active">像素锁定</button></div>
      <h2>Screens</h2>
      <div class="screen-tabs">${appScreens.map((item) => `<button data-route-target="${escapeHtml(item.route)}" class="${item.route === firstRoute ? 'active' : ''}">${escapeHtml(item.title)}</button>`).join('')}</div>
      <div class="node-meta">fileKey: ${escapeHtml(manifest.fileKey ?? '')}\nactive: ${escapeHtml(firstRoute)}\nroot: ${escapeHtml(screens[0]?.root?.id ?? '')}\nsize: ${Math.round(rootSize.width ?? 0)} x ${Math.round(rootSize.height ?? 0)}\nnodes: ${manifest.summary?.counts?.nodes ?? 0}\ninteraction: hot-zones + generated subviews enabled</div>
      <div class="ops-log" id="opsLog">[SYS] Pixel-lock visual layer ready.\n[SYS] Hover yellow regions or use keys 1-6 to navigate.</div>
      ${renderSummary('Colors', manifest.summary?.colors)}
      ${renderSummary('Typography', manifest.summary?.typography)}
      ${renderSummary('Radii', manifest.summary?.radii?.map((radius) => `${radius}px`))}
      ${renderSummary('Components', manifest.summary?.components?.map((component) => component.name || component.id))}
    </aside>
  </div>
  <script>
    const routeLabels = ${JSON.stringify(routeLabels)};
    const editableMode = document.querySelector('#editableMode');
    const exactMode = document.querySelector('#exactMode');
    const inspectPanel = document.querySelector('.inspect-panel');
    const meta = document.querySelector('.node-meta');
    const opsLog = document.querySelector('#opsLog');
    const screens = [...document.querySelectorAll('.metawar-screen')];
    const routeButtons = [...document.querySelectorAll('[data-route-target]')];
    const canvasWrap = document.querySelector('.canvas-wrap');
    const stageViewport = document.querySelector('.stage-viewport');
    const stageStack = document.querySelector('.stage-stack');

    function updateStageFit() {
      if (!canvasWrap || !stageViewport || !stageStack) return;
      const rootStyle = getComputedStyle(document.documentElement);
      const baseWidth = Number.parseFloat(rootStyle.getPropertyValue('--stage-w')) || 1440;
      const baseHeight = Number.parseFloat(rootStyle.getPropertyValue('--stage-h')) || 900;
      const scale = Math.min(canvasWrap.clientWidth / baseWidth, canvasWrap.clientHeight / baseHeight, 1);
      stageViewport.style.width = (baseWidth * scale).toFixed(2) + 'px';
      stageViewport.style.height = (baseHeight * scale).toFixed(2) + 'px';
      stageStack.style.transform = 'scale(' + scale.toFixed(4) + ')';
      stageStack.dataset.scale = scale.toFixed(4);
    }

    function setInspectorVisible(visible) {
      document.body.classList.toggle('show-inspector', visible);
      inspectPanel?.setAttribute('aria-hidden', String(!visible));
    }

    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('debug') === '1') document.body.classList.add('show-hotspots');
    if (urlParams.get('panel') === '1') setInspectorVisible(true);
    addEventListener('resize', updateStageFit, { passive:true });
    requestAnimationFrame(updateStageFit);

    function log(line) {
      if (!opsLog) return;
      const stamp = new Date().toLocaleTimeString('zh-CN', { hour12:false });
      opsLog.textContent = ('[' + stamp + '] ' + line + '\\n' + opsLog.textContent).slice(0, 900);
    }

    function activateRoute(route, source = 'manual', options = {}) {
      const next = screens.find((screen) => screen.dataset.route === route) || screens[0];
      if (!next) return;
      loadExactLayer(next);
      if (options.instant) document.body.classList.add('route-instant');
      if (!options.skipWipe) {
        document.body.classList.remove('is-switching');
        void document.body.offsetWidth;
        document.body.classList.add('is-switching');
      }
      screens.forEach((screen) => {
        const isActive = screen === next;
        screen.classList.toggle('active', isActive);
        screen.toggleAttribute('inert', !isActive);
        screen.setAttribute('aria-hidden', String(!isActive));
      });
      routeButtons.forEach((button) => button.classList.toggle('active', button.dataset.routeTarget === next.dataset.route));
      document.body.dataset.activeRoute = next.dataset.route;
      const routeName = routeLabels[next.dataset.route] || next.dataset.name || next.dataset.route;
      document.title = 'Figma Preview - ' + routeName;
      if (options.syncHash !== false) {
        const url = new URL(location.href);
        url.hash = next.dataset.route;
        history.replaceState(null, '', url);
      }
      if (meta) meta.textContent = 'active: ' + next.dataset.route + '\\nname: ' + (next.dataset.name || routeLabels[next.dataset.route] || '') + '\\nsource: ' + source + '\\nmode: ' + (document.body.classList.contains('mode-exact') ? 'pixel-lock + interaction layer' : 'editable reconstruction');
      log('ROUTE -> ' + (routeLabels[next.dataset.route] || next.dataset.route) + ' via ' + source);
      console.info('[figma-preview] route', next.dataset.route, 'via', source);
      scheduleLinkedPreload(next);
      if (options.instant) requestAnimationFrame(() => document.body.classList.remove('route-instant'));
    }

    const hashRoute = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (hashRoute && screens.some((screen) => screen.dataset.route === hashRoute)) {
      activateRoute(hashRoute, 'initial hash', { skipWipe:true, syncHash:false });
    } else {
      activateRoute(document.body.dataset.activeRoute || screens[0]?.dataset.route, 'initial state', { skipWipe:true, syncHash:false });
    }

    editableMode?.addEventListener('click', () => {
      document.body.classList.remove('mode-exact');
      editableMode.classList.add('active');
      exactMode?.classList.remove('active');
      log('MODE -> editable reconstruction');
    });
    exactMode?.addEventListener('click', () => {
      document.body.classList.add('mode-exact');
      exactMode.classList.add('active');
      editableMode?.classList.remove('active');
      log('MODE -> pixel lock');
    });

    routeButtons.forEach((button) => button.addEventListener('click', (event) => {
      ripple(event.currentTarget, event);
      activateRoute(button.dataset.routeTarget, 'screen tab');
    }));
    routeButtons.forEach((button) => button.addEventListener('pointerenter', () => preloadRoute(button.dataset.routeTarget), { passive:true }));

    function triggerRouteHotspot(node, event) {
      const now = performance.now();
      const lastPointer = Number(node.dataset.lastPointerTrigger || 0);
      if (event.type === 'click' && now - lastPointer < 160) return;
      if (event.type === 'pointerup') node.dataset.lastPointerTrigger = String(now);
      event.stopPropagation();
      ripple(node, event);
      const source = node.dataset.figmaName || node.dataset.action || 'hotspot';
      if (node.dataset.transition === 'scope-reveal') {
        scopeRevealTransition(node.dataset.targetRoute, source, node);
        return;
      }
      if (node.dataset.transition === 'state-reveal') {
        stateRevealTransition(node.dataset.targetRoute, source, node, 'state-reveal');
        return;
      }
      if (node.dataset.transition === 'smart-morph') {
        smartMorphTransition(node.dataset.targetRoute, source, 'smart-morph', node);
        return;
      }
      activateRoute(node.dataset.targetRoute, source);
    }

    document.querySelectorAll('[data-target-route]').forEach((node) => {
      node.addEventListener('pointerenter', () => preloadRoute(node.dataset.targetRoute), { passive:true });
      node.addEventListener('pointerup', (event) => {
        triggerRouteHotspot(node, event);
      });
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        triggerRouteHotspot(node, event);
      });
    });

    function triggerFeedbackHotspot(node, event) {
      const now = performance.now();
      const lastPointer = Number(node.dataset.lastPointerTrigger || 0);
      if (event.type === 'click' && now - lastPointer < 160) return;
      if (event.type === 'pointerup') node.dataset.lastPointerTrigger = String(now);
      event.stopPropagation();
      ripple(node, event);
      node.classList.add('is-pressed');
      window.setTimeout(() => node.classList.remove('is-pressed'), 180);
      const label = node.dataset.action || node.dataset.figmaName || 'surface';
      if (meta) meta.textContent = 'interaction: ' + label + '\\nname: ' + (node.dataset.figmaName || '') + '\\ntype: hover/click feedback';
      log('INTERACT -> ' + label);
    }

    document.querySelectorAll('[data-feedback="true"]').forEach((node) => {
      node.addEventListener('pointerup', (event) => {
        triggerFeedbackHotspot(node, event);
      });
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        triggerFeedbackHotspot(node, event);
      });
    });

    function loadExactLayer(screen) {
      const image = screen?.querySelector('.exact-layer img');
      if (!image) return null;
      const pendingSrc = image.dataset.src;
      if (pendingSrc && !image.getAttribute('src')) {
        image.setAttribute('src', pendingSrc);
      }
      return image;
    }

    async function ensureExactLayer(screen, timeoutMs = 180) {
      const image = loadExactLayer(screen);
      if (!image) return null;
      if (image.decode && !image.complete) {
        try {
          await Promise.race([
            image.decode(),
            new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
          ]);
        } catch {
          // Decoding is an optimization; the pixel-lock image still loads through the browser normally.
        }
      }
      return image;
    }

    function preloadRoute(route) {
      const screen = screens.find((item) => item.dataset.route === route);
      if (!screen) return;
      const image = loadExactLayer(screen);
      if (image?.decode && !image.complete) image.decode().catch(() => {});
    }

    function scheduleLinkedPreload(screen) {
      const links = [...screen.querySelectorAll('[data-target-route]')]
        .map((node) => node.dataset.targetRoute)
        .filter(Boolean);
      const unique = [...new Set(links)].slice(0, 4);
      const run = () => unique.forEach(preloadRoute);
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
      else window.setTimeout(run, 260);
    }

    async function scopeRevealTransition(route, source = 'SCOPE1', triggerNode = null) {
      return stateRevealTransition(route, source, triggerNode, 'scope-reveal');
    }

    async function stateRevealTransition(route, source = 'state reveal', triggerNode = null, transitionName = 'state-reveal') {
      const current = screens.find((screen) => screen.classList.contains('active'));
      const next = screens.find((screen) => screen.dataset.route === route);
      const toImage = await ensureExactLayer(next);
      const toSrc = toImage?.getAttribute('src') || toImage?.dataset.src;
      if (!next || !toSrc || !stageStack) {
        activateRoute(route, source, { skipWipe:true });
        return;
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        activateRoute(route, source + ' ' + transitionName, { skipWipe:true, instant:true });
        return;
      }
      const currentRoute = current?.dataset.route;
      const currentStage = current?.querySelector('.figma-stage, .generated-stage');
      const focusBox = triggerNode && currentStage ? stageBoxFromNode(triggerNode, currentStage) : null;
      if (currentRoute && document.body.dataset.activeRoute !== currentRoute) return;
      document.querySelectorAll('.scope-reveal-overlay').forEach((node) => node.remove());
      const overlay = document.createElement('div');
      overlay.className = 'scope-reveal-overlay ' + transitionName;
      overlay.dataset.transition = transitionName;
      const nextLayer = document.createElement('div');
      nextLayer.className = 'scope-reveal-next';
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = toSrc;
      nextLayer.appendChild(image);
      const haze = document.createElement('div');
      haze.className = 'scope-reveal-haze';
      const focus = document.createElement('div');
      focus.className = 'scope-reveal-focus';
      const scan = document.createElement('div');
      scan.className = 'scope-reveal-scan';
      overlay.append(nextLayer, haze, focus, scan);
      if (focusBox) applyFocusBox(overlay, focusBox);
      stageStack.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-playing'));
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        activateRoute(route, source + ' ' + transitionName, { skipWipe:true, instant:true });
        overlay.classList.add('is-settling');
      };
      window.setTimeout(commit, 610);
      window.setTimeout(() => overlay.remove(), 960);
      log('MORPH -> ' + transitionName + ' on ' + (routeLabels[route] || route));
      console.info('[figma-preview]', transitionName, route);
    }

    function smartMorphTransition(route, source = 'smart morph', transitionName = 'smart-morph', triggerNode = null) {
      const current = screens.find((screen) => screen.classList.contains('active'));
      const next = screens.find((screen) => screen.dataset.route === route);
      if (!next) {
        activateRoute(route, source);
        return;
      }
      const fromSrc = current?.querySelector('.exact-layer img')?.getAttribute('src');
      const currentStage = current?.querySelector('.figma-stage, .generated-stage');
      const focusBox = triggerNode && currentStage ? stageBoxFromNode(triggerNode, currentStage) : null;
      activateRoute(route, source + ' smart morph', { skipWipe:true, instant:true });
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const activeStage = next.querySelector('.figma-stage, .generated-stage');
      if (!activeStage) return;
      activeStage.querySelector('.smart-morph-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'smart-morph-overlay';
      overlay.dataset.transition = transitionName;
      overlay.innerHTML = '<div class="smart-morph-before"></div><div class="smart-morph-haze"></div><div class="smart-morph-focus"></div><div class="smart-morph-scan"></div>';
      if (fromSrc) overlay.querySelector('.smart-morph-before').style.backgroundImage = 'url("' + fromSrc.replace(/"/g, '\\"') + '")';
      if (focusBox) applyFocusBox(overlay, focusBox);
      activeStage.appendChild(overlay);
      log('MORPH -> ' + transitionName + ' on ' + (routeLabels[route] || route));
      console.info('[figma-preview] smart morph', transitionName, route);
      window.setTimeout(() => overlay.remove(), 1680);
    }

    function stageBoxFromNode(node, stage) {
      const nodeRect = node.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const scale = Number(stageStack?.dataset.scale || 1) || 1;
      return {
        x: (nodeRect.left - stageRect.left) / scale,
        y: (nodeRect.top - stageRect.top) / scale,
        width: nodeRect.width / scale,
        height: nodeRect.height / scale,
      };
    }

    function applyFocusBox(overlay, box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const stageWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-w')) || 1440;
      const stageHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-h')) || 900;
      overlay.style.setProperty('--focus-left', box.x + 'px');
      overlay.style.setProperty('--focus-top', box.y + 'px');
      overlay.style.setProperty('--focus-width', box.width + 'px');
      overlay.style.setProperty('--focus-height', box.height + 'px');
      overlay.style.setProperty('--focus-cx', ((centerX / stageWidth) * 100).toFixed(2) + '%');
      overlay.style.setProperty('--focus-cy', ((centerY / stageHeight) * 100).toFixed(2) + '%');
    }

    document.querySelectorAll('[data-inspect-id]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        ripple(node, event);
        if (meta) meta.textContent = 'selected: ' + node.dataset.inspectId + '\\nname: ' + (node.dataset.figmaName || '') + '\\ntype: ' + (node.dataset.figmaType || '');
      });
    });

    document.querySelectorAll('.part').forEach((part) => part.addEventListener('click', (event) => {
      document.querySelectorAll('.part').forEach((item) => item.classList.remove('selected'));
      part.classList.add('selected');
      ripple(part, event);
      log('ARMAMENT MODULE SELECTED -> ' + part.textContent.trim().replace(/\\s+/g, ' '));
    }));
    document.querySelectorAll('.wall-item').forEach((item) => item.addEventListener('click', (event) => {
      item.classList.toggle('selected');
      ripple(item, event);
      log('WAREHOUSE SLOT ' + (item.classList.contains('selected') ? 'LOCKED' : 'RELEASED') + ' -> ' + item.textContent.trim());
    }));
    document.querySelectorAll('.tech-node').forEach((item) => item.addEventListener('click', (event) => {
      item.classList.toggle('unlocked');
      ripple(item, event);
      log('R&D NODE TOGGLED -> ' + item.querySelector('h3')?.textContent);
    }));
    document.querySelectorAll('.med-btn').forEach((item) => item.addEventListener('click', (event) => {
      ripple(item, event);
      log('MEDICAL ACTION QUEUED -> ' + item.textContent.trim().replace(/\\s+/g, ' '));
    }));
    document.querySelectorAll('.map-card').forEach((card) => card.addEventListener('click', (event) => {
      document.querySelectorAll('.map-card').forEach((item) => item.classList.remove('selected'));
      card.classList.add('selected');
      ripple(card, event);
      log('THEATER SELECTED -> ' + card.querySelector('h3')?.textContent);
    }));

    function ripple(host, event) {
      const rect = host.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.left = ((event.clientX || rect.left + rect.width / 2) - rect.left) + 'px';
      dot.style.top = ((event.clientY || rect.top + rect.height / 2) - rect.top) + 'px';
      host.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());
    }

    addEventListener('keydown', (event) => {
      if ((event.key === 'd' || event.key === 'D') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setInspectorVisible(!document.body.classList.contains('show-inspector'));
        updateStageFit();
        return;
      }
      if (event.key === 'Escape') setInspectorVisible(false);
      if ((event.key === 'h' || event.key === 'H') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        document.body.classList.toggle('show-hotspots');
        log('HOTSPOTS -> ' + (document.body.classList.contains('show-hotspots') ? 'visible' : 'hidden'));
        return;
      }
      const keyNumber = /^[1-6]$/.test(event.key) ? event.key : event.code?.match(/^(Digit|Numpad)([1-6])$/)?.[2];
      const idx = Number(keyNumber) - 1;
      if (idx >= 0 && idx < ${ROUTES.length}) activateRoute(${JSON.stringify(ROUTES.map((route) => route.id))}[idx], 'keyboard ' + event.key);
    });
  </script>
</body>
</html>`;
}

export function renderNode(node) {
  const style = buildCssStyleForNode(node);
  const attrs = `class="figma-node" data-figma-id="${escapeHtml(node.id)}" data-inspect-id="${escapeHtml(node.id)}" data-figma-name="${escapeHtml(node.name ?? '')}" data-figma-type="${escapeHtml(node.type ?? '')}" style="${escapeHtml(style)}"`;
  if (node.type === 'TEXT') {
    return `          <div ${attrs}>${escapeHtml(node.text ?? '')}</div>`;
  }
  if (node.asset?.publicPath) {
    return `          <div ${attrs}><img src="${escapeHtml(node.asset.publicPath)}" alt="${escapeHtml(node.name ?? '')}" loading="lazy" /></div>`;
  }
  return `          <div ${attrs}></div>`;
}

function renderPixelScreen(screen, active, interactionConfig = { autoInteractions: false, profile: 'product' }, allScreens = []) {
  const root = screen.root ?? { size: { width: 1440, height: 900 } };
  const rootNode = (screen.nodes ?? []).find((node) => node.id === root.id);
  const bodyNodes = (screen.nodes ?? []).filter((node) => node.box && node.id !== root.id);
  const stageBackground = rootNode?.fill ?? '#020406';
  return `        <section class="metawar-screen ${active ? 'active' : ''}" data-route="${escapeHtml(screen.route)}" data-name="${escapeHtml(screen.name)}" aria-hidden="${active ? 'false' : 'true'}" ${active ? '' : 'inert'}>
          <main class="figma-stage" aria-label="${escapeHtml(screen.name)}" style="--stage-w:${px(root.size?.width ?? 1440)};--stage-h:${px(root.size?.height ?? 900)};background:${escapeHtml(stageBackground)}">
            <div class="editable-layer">
${bodyNodes.map(renderNode).join('\n')}
            </div>
            ${renderExactLayer(screen.exactExports, active)}
            <div class="fx-layer"><div class="rain-field"></div><div class="scan-sweep"></div><div class="boot-flash"></div></div>
            ${renderInteractionLayer(screen, interactionConfig, allScreens)}
          </main>
        </section>`;
}

function renderGeneratedScreen(route, active) {
  return `        <section class="metawar-screen ${active ? 'active' : ''}" data-route="${escapeHtml(route)}" data-name="${escapeHtml(routeLabel(route))}" aria-hidden="${active ? 'false' : 'true'}" ${active ? '' : 'inert'}>
          <main class="generated-stage" aria-label="${escapeHtml(routeLabel(route))}">
            ${renderGeneratedHeader(route)}
            <div class="gen-content">${renderGeneratedContent(route)}</div>
            ${renderGeneratedFooter(route)}
            <div class="fx-layer"><div class="rain-field"></div><div class="scan-sweep"></div></div>
          </main>
        </section>`;
}

function renderGeneratedHeader(activeRoute) {
  return `<header class="gen-header"><div class="gen-logo">METAWAR <small>BETA_BUILD.24</small></div><nav class="gen-nav">${ROUTES.slice(0, 4).map((route) => `<button data-target-route="${route.id}" class="${route.id === activeRoute ? 'active' : ''}">${escapeHtml(route.label)}</button>`).join('')}</nav><div class="wallet"><span>军工资金</span>♦5,548.00</div></header>`;
}

function renderGeneratedFooter(activeRoute) {
  const buttons = [
    { route: 'map', cls: 'primary', sub: 'COMMENCE OPERATION', title: '空降部署' },
    { route: 'loadout', sub: 'GUNSMITH', title: '枪匠与配装' },
    { route: 'inventory', sub: 'STASH WALL', title: '战备高墙' },
    { route: 'medical', sub: 'CLINICAL SCAN', title: '医疗诊断' },
  ];
  return `<footer class="gen-footer">${buttons.map((button) => `<button class="hud-btn ${button.cls ?? ''} ${button.route === activeRoute ? 'active' : ''}" data-target-route="${button.route}"><span>${button.sub}</span><strong>${button.title}</strong></button>`).join('')}</footer>`;
}

function renderGeneratedContent(route) {
  if (route === 'loadout') return `<div class="loadout-grid"><section class="weapon-card glass"><h2 class="panel-title">GUNSMITH<br>LOADOUT</h2>${statBar('DAMAGE', 85)}${statBar('FIRE RATE', 62)}${statBar('MOBILITY', 45, 'var(--acid)')}${statBar('ACCURACY', 78)}</section><section class="weapon-hero"><div class="weapon-sil"></div><div><h2 class="panel-title">MK-14 ENHANCED</h2><div class="micro">ASSAULT RIFLE // 5.56 NATO</div></div></section><section class="part-list">${['MZ 战术消音器', 'OP 全息衍射瞄具', 'MG 扩容聚合物弹匣', 'UB 垂直前握把'].map((item) => `<button class="part glass"><b>${item.slice(0, 2)}</b><span>${escapeHtml(item.slice(3))}<br><small class="micro">MODULE READY</small></span></button>`).join('')}</section></div>`;
  if (route === 'inventory') return `<div class="inventory-grid"><section class="stash">${['M4A1 TACTICAL RIFLE', 'CLASS IV ARMOR', 'MEDKIT SURGE', '5.56 MAG', '5.56 MAG', 'GOLD WATCH', 'GP COIN', 'KEYCARD', 'BROKEN SHOTGUN', 'FRAG GRENADE', 'TACTICAL RIG', 'WATER FILTER', 'MORPHINE'].map((item, index) => `<button class="wall-item ${index === 0 ? 'x6' : index === 1 ? 'x3' : index < 6 ? 'x2' : 'x1'}">${escapeHtml(item)}</button>`).join('')}</section><aside class="glass" style="padding:24px"><h2 class="panel-title">STASH<br>WALL</h2><p class="micro">空间利用率 42% // 点击物资格切换锁定状态</p></aside></div>`;
  if (route === 'research') return `<div><h2 class="panel-title">RESEARCH &<br>MODIFICATIONS</h2><div class="research-grid">${['高分子装甲熔炼', '止血凝胶提纯', '枪管膛线重塑', '热成像伪装网', '大容量储物箱', '雨线雷达回声'].map((item, index) => `<button class="tech-node glass ${index < 2 ? 'unlocked' : ''}"><div class="idx">0${index + 1}</div><h3>${escapeHtml(item)}</h3><p class="micro">${index < 2 ? 'UNLOCKED' : 'PENDING MATERIALS'}</p></button>`).join('')}</div></div>`;
  if (route === 'medical') return `<div class="medical-grid"><section class="body-scan"></section><aside class="medical-actions"><h2 class="panel-title">CLINICAL<br>SCAN</h2><p class="micro">肺部穿透伤 // 左腿骨折 // 水分正常</p><button class="med-btn">启动纳米修复舱</button><button class="med-btn" style="border-color:var(--red);color:var(--red);background:rgba(255,42,64,.08)">强行注射肾上腺素</button></aside></div>`;
  if (route === 'map') return `<div><h2 class="panel-title">SELECT COMBAT<br>THEATER</h2><div class="map-grid">${['RAINLINE FACTORY', 'ASHEN HARBOR', 'RED SILO'].map((item, index) => `<button class="map-card glass ${index === 0 ? 'selected' : ''}"><div><h3>${escapeHtml(item)}</h3><p class="micro">${index === 2 ? 'RESTRICTED / RADIATION' : 'MEDIUM THEATER / HIGH CONTACT'}</p></div></button>`).join('')}</div></div>`;
  return `<div><h2 class="panel-title">ENTER<br>THE RAINLINE</h2><p class="micro">SYSTEM OPERATIONAL // AWAITING COMMAND</p></div>`;
}

function statBar(name, value, color = 'var(--cyan)') {
  return `<div class="bar"><label><span>${escapeHtml(name)}</span><span>${value}</span></label><i style="--w:${value}%;--c:${color}"></i></div>`;
}

function renderInteractionLayer(screen, interactionConfig = { autoInteractions: false }, allScreens = []) {
  const routeHotspots = buildHotspots(screen, interactionConfig, allScreens);
  const feedbackHotspots = interactionConfig.autoInteractions ? buildFeedbackHotspots(screen, routeHotspots) : [];
  return `<div class="interaction-layer">${feedbackHotspots.map((hotspot) => `<button class="hotspot feedback-hotspot" data-kind="feedback" data-feedback="true" data-action="${escapeHtml(hotspot.label)}" data-figma-name="${escapeHtml(hotspot.source)}" style="${hotspotStyle(hotspot.box)}" aria-label="${escapeHtml(hotspot.label)}" tabindex="-1"><span class="hotspot-label">${escapeHtml(hotspot.label)}</span></button>`).join('')}${routeHotspots.map((hotspot) => `<button class="hotspot" data-kind="${escapeHtml(hotspot.kind)}" data-target-route="${escapeHtml(hotspot.target)}" data-action="${escapeHtml(hotspot.label)}" data-figma-name="${escapeHtml(hotspot.source)}"${hotspot.transition ? ` data-transition="${escapeHtml(hotspot.transition)}"` : ''} style="${hotspotStyle(hotspot.box)}" aria-label="${escapeHtml(hotspot.label)}"><span class="hotspot-label">${escapeHtml(hotspot.label)}</span></button>`).join('')}</div>`;
}

function buildHotspots(screen, interactionConfig = { autoInteractions: false }, allScreens = []) {
  const nodes = screen.nodes ?? [];
  const hotspots = [];
  const route = screen.route;
  hotspots.push(...buildNavHotspots(nodes));

  for (const node of nodes) {
    if (!node.box || !['RECTANGLE', 'FRAME'].includes(node.type)) continue;
    const name = node.name ?? '';
    if (/主按钮|空降部署/.test(name)) hotspots.push({ kind: 'primary', target: 'map', label: '空降部署', source: name, box: node.box });
    else if (/底部按钮\s*枪匠|枪匠与配装/.test(name)) hotspots.push({ kind: 'footer', target: 'loadout', label: '枪匠与配装', source: name, box: node.box });
    else if (/底部按钮\s*战备|战备高墙/.test(name)) hotspots.push({ kind: 'footer', target: 'inventory', label: '战备高墙', source: name, box: node.box });
    else if (/底部按钮\s*医疗|医疗诊断/.test(name)) hotspots.push({ kind: 'footer', target: 'medical', label: '医疗诊断', source: name, box: node.box });
  }

  if (route === 'loadout') {
    for (const node of matchingBoxNodes(nodes, /accessories|配件/i)) {
      hotspots.push({ kind: 'gunsmith', target: 'gunsmith-detail', label: 'ACCESSORIES', source: node.name || node.text || 'ACCESSORIES', box: normalizeHotspotBox(node.box) });
    }
  }

  if (route === 'gunsmith-detail') {
    for (const node of matchingBoxNodes(nodes, /\bSCOPE\s*1\b|SCOPE1|瞄准镜|瞄具/i)) {
      hotspots.push({
        kind: 'gunsmith',
        target: 'gunsmith-selected',
        label: 'SCOPE1',
        source: node.name || node.text || 'SCOPE1',
        box: nearestAccessorySlotBox(nodes, node.box) ?? normalizeHotspotBox(node.box),
        transition: 'scope-reveal',
      });
    }
  }

  if (route === 'gunsmith-selected') {
    const rifleNodes = findRifleNodes(nodes);
    rifleNodes.forEach((rifleNode, index) => {
      hotspots.push({
        kind: 'gunsmith',
        target: 'gunsmith-selected-rifle',
        label: `fully automatic rifle${index + 1}`,
        source: rifleNode.name || rifleNode.text || 'fully automatic rifle1',
        box: nearestSelectableCardBox(nodes, rifleNode.box) ?? normalizeHotspotBox(rifleNode.box, 18),
        transition: sameLevelTransition(screen, 'gunsmith-selected-rifle', allScreens) ?? 'state-reveal',
      });
    });
  }
  return dedupeHotspots(hotspots);
}

function buildFeedbackHotspots(screen, routeHotspots = []) {
  const nodes = screen.nodes ?? [];
  const rootId = screen.root?.id ?? screen.id;
  const rootSize = screen.root?.size ?? { width: 1440, height: 900 };
  const rootArea = Math.max(1, (rootSize.width ?? 1440) * (rootSize.height ?? 900));
  const candidates = nodes
    .filter((node) => isFeedbackCandidate(node, rootId, rootArea))
    .map((node) => ({
      kind: 'feedback',
      label: feedbackLabel(node),
      source: node.name || node.text || node.id,
      box: normalizeFeedbackBox(node.box),
      score: feedbackScore(node),
    }))
    .filter((hotspot) => hotspot.label && !overlapsRouteHotspot(hotspot.box, routeHotspots))
    .sort((a, b) => (a.score - b.score) || (a.box.y - b.box.y) || (a.box.x - b.box.x));

  return dedupeFeedbackHotspots(candidates).slice(0, 42);
}

function isFeedbackCandidate(node, rootId, rootArea) {
  if (!node.box || node.id === rootId) return false;
  const { width = 0, height = 0 } = node.box;
  const area = width * height;
  if (width < 16 || height < 12 || area < 260 || area > rootArea * 0.22) return false;
  const label = `${node.name ?? ''} ${node.text ?? ''}`.trim();
  if (!label) return false;
  if (node.type === 'TEXT' && (node.text ?? '').trim().length >= 2) return true;
  if (!['FRAME', 'INSTANCE', 'COMPONENT', 'RECTANGLE'].includes(node.type)) return false;
  return /button|btn|card|slot|scope|accessor|module|loot|rifle|weapon|item|tab|nav|按钮|配件|瞄|枪|物资|模块|卡片|面板|Frame\s*\d+/i.test(label);
}

function feedbackLabel(node) {
  const raw = (node.text || node.name || node.id || 'surface').replace(/\s+/g, ' ').trim();
  if (!raw) return 'surface feedback';
  return raw.length > 34 ? `${raw.slice(0, 31)}...` : raw;
}

function feedbackScore(node) {
  const label = `${node.name ?? ''} ${node.text ?? ''}`;
  if (/button|btn|按钮/i.test(label)) return 0;
  if (/scope|accessor|配件|瞄/i.test(label)) return 1;
  if (/rifle|weapon|枪/i.test(label)) return 2;
  if (node.type === 'TEXT') return 3;
  return 4;
}

function normalizeFeedbackBox(box) {
  const padX = Math.max(6, Math.min(18, box.width * 0.05));
  const padY = Math.max(5, Math.min(14, box.height * 0.14));
  return {
    x: box.x - padX,
    y: box.y - padY,
    width: box.width + padX * 2,
    height: box.height + padY * 2,
  };
}

function overlapsRouteHotspot(box, routeHotspots) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return routeHotspots.some((hotspot) => {
    const target = hotspot.box;
    const overlap = boxOverlapArea(box, target);
    const ratio = overlap / Math.max(1, Math.min(boxArea(box), boxArea(target)));
    return ratio > 0.42 || pointInsideBox(cx, cy, target);
  });
}

function boxOverlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function dedupeFeedbackHotspots(hotspots) {
  const seen = new Set();
  return hotspots.filter((hotspot) => {
    const key = `${Math.round(hotspot.box.x / 8)}:${Math.round(hotspot.box.y / 8)}:${Math.round(hotspot.box.width / 8)}:${Math.round(hotspot.box.height / 8)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildNavHotspots(nodes) {
  const semanticHotspots = nodes
    .filter((node) => node.box && node.type === 'TEXT')
    .map((node) => {
      const nav = inferNavTarget(`${node.name ?? ''} ${node.text ?? ''}`);
      if (!nav || !isTopNavText(node)) return null;
      return {
        kind: 'nav',
        target: nav.target,
        label: nav.label,
        source: node.name || node.text || nav.label,
        box: nearestNavButtonBox(nodes, node.box) ?? normalizeHotspotBox(node.box),
      };
    })
    .filter(Boolean);

  if (semanticHotspots.length) return semanticHotspots;

  const navFrames = nodes
    .filter((node) => node.type === 'FRAME' && node.box && node.box.y <= 80 && node.box.width >= 80 && node.box.width <= 260 && node.box.height <= 48)
    .sort((a, b) => a.box.x - b.box.x);
  const navTargets = [
    { target: 'home', label: 'Play' },
    { target: 'loadout', label: 'armament' },
    { target: 'inventory', label: 'warehouse' },
    { target: 'map', label: 'store' },
  ];
  return navFrames.slice(0, navTargets.length).map((node, index) => ({
    kind: 'nav',
    target: navTargets[index].target,
    label: navTargets[index].label,
    source: node.name,
    box: expandBox(node.box, 0),
  }));
}

function inferNavTarget(value) {
  if (/armament|枪匠|配装|armory/i.test(value)) return { target: 'loadout', label: 'armament' };
  if (/warehouse|战备|仓库|inventory/i.test(value)) return { target: 'inventory', label: 'warehouse' };
  if (/\bstore\b|沙盘|地图|map/i.test(value)) return { target: 'map', label: 'store' };
  if (/\bplay\b|部署|总览|home/i.test(value)) return { target: 'home', label: 'Play' };
  return null;
}

function isTopNavText(node) {
  const box = node.box;
  if (!box) return false;
  const label = `${node.name ?? ''} ${node.text ?? ''}`;
  if (!inferNavTarget(label)) return false;
  return box.y >= 0 && box.y <= 120 && box.width >= 10 && box.height >= 8 && box.width <= 220 && box.height <= 60;
}

function nearestNavButtonBox(nodes, textBox) {
  const cx = textBox.x + textBox.width / 2;
  const cy = textBox.y + textBox.height / 2;
  const candidates = nodes
    .filter((node) => {
      if (!node.box || !['FRAME', 'INSTANCE', 'COMPONENT', 'RECTANGLE'].includes(node.type)) return false;
      const box = node.box;
      return box.y <= 120
        && box.width >= textBox.width
        && box.width <= 280
        && box.height >= textBox.height
        && box.height <= 70
        && pointInsideBox(cx, cy, box);
    })
    .sort((a, b) => boxArea(a.box) - boxArea(b.box));
  return candidates[0]?.box;
}

function pointInsideBox(x, y, box) {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

function boxArea(box) {
  return (box?.width ?? 0) * (box?.height ?? 0);
}

function findRifleNodes(nodes) {
  return nodes
    .filter((node) => node.type === 'TEXT' && node.box && /fully\s+automatic\s+rifle/i.test(`${node.name ?? ''} ${node.text ?? ''}`))
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function nearestSelectableCardBox(nodes, textBox) {
  const cx = textBox.x + textBox.width / 2;
  const cy = textBox.y + textBox.height / 2;
  const candidates = nodes
    .filter((node) => {
      if (!node.box || !['FRAME', 'INSTANCE', 'COMPONENT', 'RECTANGLE'].includes(node.type)) return false;
      const box = node.box;
      return box.width >= textBox.width
        && box.width <= Math.max(360, textBox.width + 140)
        && box.height >= textBox.height
        && box.height <= 260
        && pointInsideBox(cx, cy, box);
    })
    .sort((a, b) => boxArea(a.box) - boxArea(b.box));
  return candidates[0]?.box ? expandBox(candidates[0].box, 10) : null;
}

function nearestAccessorySlotBox(nodes, textBox) {
  const cx = textBox.x + textBox.width / 2;
  const cy = textBox.y + textBox.height / 2;
  const candidates = nodes
    .filter((node) => {
      if (!node.box || !['FRAME', 'INSTANCE', 'COMPONENT', 'RECTANGLE'].includes(node.type)) return false;
      const box = node.box;
      return box.width >= textBox.width
        && box.width <= 160
        && box.height >= Math.max(textBox.height, 48)
        && box.height <= 170
        && pointInsideBox(cx, cy, box);
    })
    .sort((a, b) => boxArea(a.box) - boxArea(b.box));
  return candidates[0]?.box ? expandBox(candidates[0].box, 8) : null;
}

function matchingBoxNodes(nodes, pattern) {
  return nodes
    .filter((node) => node.box && pattern.test(`${node.name ?? ''} ${node.text ?? ''}`))
    .filter((node) => {
      const area = (node.box.width ?? 0) * (node.box.height ?? 0);
      return area > 0 && area < 160000 && (node.box.width ?? 0) >= 10 && (node.box.height ?? 0) >= 10;
    })
    .sort((a, b) => hotspotRank(a) - hotspotRank(b));
}

function hotspotRank(node) {
  const typeRank = ['FRAME', 'INSTANCE', 'COMPONENT', 'RECTANGLE', 'TEXT'].indexOf(node.type);
  return typeRank === -1 ? 10 : typeRank;
}

function normalizeHotspotBox(box, minPad = 0) {
  const padX = Math.max(minPad, 8, Math.min(24, box.width * 0.08));
  const padY = Math.max(minPad, 6, Math.min(18, box.height * 0.18));
  const expanded = expandBox(box, 0);
  expanded.x -= padX;
  expanded.y -= padY;
  expanded.width += padX * 2;
  expanded.height += padY * 2;
  return expanded;
}

function dedupeHotspots(hotspots) {
  const seen = new Set();
  return hotspots.filter((hotspot) => {
    const key = `${hotspot.target}:${Math.round(hotspot.box.x)}:${Math.round(hotspot.box.y)}:${Math.round(hotspot.box.width)}:${Math.round(hotspot.box.height)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hotspotStyle(box) {
  return `left:${px(box.x)};top:${px(box.y)};width:${px(box.width)};height:${px(box.height)}`;
}

function expandBox(box, amount) {
  return { x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 };
}

function resolveInteractionConfig(manifest, screens = []) {
  const preview = manifest.preview ?? {};
  const autoInteractions = preview.autoInteractions === true
    || preview.interactionMode === 'auto'
    || preview.interactions === 'auto'
    || preview.interactions?.auto === true;
  return {
    autoInteractions,
    profile: normalizeInteractionProfile(preview.interactionProfile || preview.profile || inferInteractionProfile(manifest, screens)),
  };
}

function inferInteractionProfile(manifest, screens = []) {
  const text = [
    manifest.root?.name,
    ...(screens ?? []).map((screen) => screen.name),
    ...(manifest.nodes ?? []).flatMap((node) => [node.name, node.text]),
  ].filter(Boolean).join(' ');
  if (/metawar|gunsmith|armament|loadout|weapon|rifle|scope|warehouse|medbay|战备|枪匠|枪|配件|军工|沙盘|部署/i.test(text)) return 'game';
  if (/social|chat|message|follow|like|comment|avatar|feed|community|社交|聊天|关注|点赞|评论|动态/i.test(text)) return 'social';
  return 'product';
}

function normalizeInteractionProfile(profile = 'product') {
  const clean = String(profile).trim().toLowerCase();
  if (['game', 'social', 'product'].includes(clean)) return clean;
  return 'product';
}

function sameLevelTransition(screen, targetRoute, allScreens = []) {
  const target = allScreens.find((item) => item.route === targetRoute);
  if (!screen || !target) return '';
  return isSameLevelScreen(screen.name, target.name) ? 'state-reveal' : '';
}

function isSameLevelScreen(fromName = '', toName = '') {
  const fromNumber = leadingScreenNumber(fromName);
  const toNumber = leadingScreenNumber(toName);
  const fromKey = interactionFamilyKey(fromName);
  const toKey = interactionFamilyKey(toName);
  if (!fromKey || fromKey !== toKey) return false;
  if (fromNumber && toNumber && Math.floor(fromNumber) === Math.floor(toNumber) && !Number.isInteger(fromNumber) && !Number.isInteger(toNumber)) return true;
  return /选中|selected|detail|详细|expanded|展开|状态|state/i.test(`${fromName} ${toName}`);
}

function leadingScreenNumber(name = '') {
  const match = String(name).trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function interactionFamilyKey(name = '') {
  const clean = String(name)
    .replace(/^\s*\d+(?:\.\d+)?\s*/, '')
    .replace(/Pencil编辑版/gi, '')
    .trim();
  const parts = clean.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join(' - ').toLowerCase();
  if (/枪匠|gunsmith|armament/i.test(clean)) return 'gunsmith';
  if (/社交|social|chat|message/i.test(clean)) return 'social';
  return parts[0]?.toLowerCase() ?? '';
}

function renderExactLayer(exact, eager = false) {
  const png = exact?.png?.publicPath;
  const svg = exact?.svg?.publicPath;
  // Prefer the high-scale root PNG for the visible pixel-lock layer; SVG is kept as a fallback for vector-only exports.
  const src = png || svg;
  if (!src) return '<div class="exact-layer" aria-hidden="true"></div>';
  const sourceAttr = eager
    ? `src="${escapeHtml(src)}" fetchpriority="high" loading="eager"`
    : `data-src="${escapeHtml(src)}" loading="lazy"`;
  return `<div class="exact-layer"><img ${sourceAttr} alt="Pixel-locked Figma export" decoding="async" /></div>`;
}

function renderSummary(title, values = []) {
  if (!values?.length) return '';
  return `<h2>${escapeHtml(title)}</h2><div class="chip-list">${values.slice(0, 120).map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join('')}</div>`;
}

function normalizeScreens(manifest) {
  const sourceScreens = manifest.screens?.length ? manifest.screens : [{
    id: manifest.root?.id ?? 'root',
    name: manifest.root?.name ?? 'Figma Root',
    root: manifest.root,
    nodes: manifest.nodes ?? [],
    exactExports: manifest.exactExports,
  }];
  return sourceScreens.map((screen, index) => ({
    id: screen.id ?? screen.root?.id ?? `screen-${index}`,
    name: screen.name ?? screen.root?.name ?? `Screen ${index + 1}`,
    route: inferRoute(screen.name ?? screen.root?.name ?? '', index),
    root: screen.root ?? { id: screen.id, name: screen.name, type: 'FRAME', size: { width: 1440, height: 900 }, origin: { x: 0, y: 0 } },
    nodes: screen.nodes ?? [],
    exactExports: screen.exactExports ?? (index === 0 ? manifest.exactExports : {}),
  }));
}

function inferRoute(name, index) {
  if (/^\s*2\.3\b|选中适配配件|selected\s+compatible|adapted accessory/i.test(name)) return 'gunsmith-selected-rifle';
  if (/^\s*2\.2\b|selected accessory|selected scope/i.test(name)) return 'gunsmith-selected';
  if (/^\s*02\b.*选中配件/i.test(name)) return 'gunsmith-selected-rifle';
  if (/选中配件/i.test(name)) return `gunsmith-selected-${index + 1}`;
  if (/2\.1|详细改造|accessories|accessory detail|gunsmith detail/i.test(name) && /枪匠|GUNSMITH|armament/i.test(name)) return 'gunsmith-detail';
  if (/枪匠|GUNSMITH|armament/i.test(name)) return 'loadout';
  if (/战备|仓库|inventory|warehouse/i.test(name)) return 'inventory';
  if (/科技|研发|research/i.test(name)) return 'research';
  if (/医疗|medical|clinical/i.test(name)) return 'medical';
  if (/沙盘|地图|map|store/i.test(name)) return 'map';
  if (/部署|总览|home|play/i.test(name)) return 'home';
  return ROUTES[index]?.id ?? `screen-${index + 1}`;
}

function routeLabel(route) {
  return ROUTES.find((item) => item.id === route)?.cn ?? route;
}

function routeSortValue(route) {
  const order = ['home', 'loadout', 'gunsmith-detail', 'gunsmith-selected', 'gunsmith-selected-rifle', 'inventory', 'map', 'research', 'medical'];
  const index = order.indexOf(route);
  return index === -1 ? 100 : index;
}

function findAsset(manifest, pattern) {
  const assets = manifest.summary?.assets ?? [];
  const match = assets.find((asset) => pattern.test(asset.publicPath ?? '') || pattern.test(asset.nodeId ?? '') || pattern.test(asset.imageHash ?? ''));
  return match?.publicPath;
}

function radiusToCss(radius) {
  if (Array.isArray(radius)) return radius.map(px).join(' ');
  return px(radius);
}

function px(value) {
  return `${Math.round(Number(value ?? 0) * 1000) / 1000}px`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCssString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeCssUrl(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
