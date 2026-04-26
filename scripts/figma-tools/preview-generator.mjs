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
  const screens = normalizeScreens(manifest);
  const figmaRoutes = new Set(screens.map((screen) => screen.route));
  const appScreens = [
    ...screens.map((screen) => ({ kind: 'figma', route: screen.route, title: screen.name, screen })),
    ...ROUTES.filter((route) => !figmaRoutes.has(route.id)).map((route) => ({ kind: 'generated', route: route.id, title: route.cn })),
  ];
  const firstRoute = appScreens[0]?.route ?? 'home';
  const title = `Figma Preview - ${screens[0]?.name ?? manifest.root?.name ?? 'METAWAR'}`;
  const rootSize = screens[0]?.root?.size ?? manifest.root?.size ?? { width: 1440, height: 900 };
  const bgAsset = findAsset(manifest, /背景|factory|rain/i) ?? screens[0]?.exactExports?.png?.publicPath ?? '';
  const heroAsset = findAsset(manifest, /jimeng|人物|角色|character/i) ?? '';

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
    .hotspot { position:absolute; border:1px solid transparent; background:rgba(255,255,0,0); pointer-events:auto; cursor:crosshair; overflow:hidden; transition:border-color .18s var(--ease), background .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease); }
    .hotspot:hover, .hotspot:focus-visible { border-color:var(--line-hot); background:rgba(255,255,0,.09); box-shadow:0 0 0 1px rgba(0,0,0,.45), 0 0 24px rgba(255,255,0,.22); outline:0; transform:translateY(-1px); }
    .hotspot[data-kind="primary"]:hover { background:rgba(255,255,0,.18); box-shadow:0 0 38px rgba(255,255,0,.34); }
    .hotspot-label { position:absolute; left:8px; top:6px; opacity:0; color:#050505; background:var(--acid); font:700 10px/1.1 "JetBrains Mono",monospace; letter-spacing:.08em; padding:4px 6px; transform:translateY(-4px); transition:.18s var(--ease); }
    .hotspot:hover .hotspot-label { opacity:1; transform:translateY(0); }
    .rain-field::before, .rain-field::after { content:""; position:absolute; inset:-25% 0; background:repeating-linear-gradient(105deg, transparent 0 26px, rgba(255,255,255,.12) 27px 28px, transparent 29px 60px); opacity:.22; animation:rainDrift 1.4s linear infinite; }
    .rain-field::after { opacity:.11; animation-duration:2.1s; transform:scaleX(-1); }
    .scan-sweep { position:absolute; left:-20%; right:-20%; top:-8%; height:18%; background:linear-gradient(180deg, transparent, rgba(0,240,255,.12), transparent); animation:scanSweep 5.8s var(--ease) infinite; }
    .boot-flash { position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); transform:translateX(-120%); animation:bootFlash .9s var(--ease) .15s both; }
    .transition-wipe { position:fixed; inset:0; z-index:40; pointer-events:none; background:linear-gradient(90deg, transparent, rgba(255,255,0,.34), transparent); transform:translateX(-120%); opacity:0; }
    body.is-switching .transition-wipe { animation:wipe .48s var(--ease); }
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
    @keyframes ripple { to { transform:translate(-50%,-50%) scale(24); opacity:0; } }
    @keyframes barIn { from { transform:scaleX(0); transform-origin:left; } }
    @keyframes floatWeapon { 50% { transform:translateY(-16px); } }
    @keyframes bodyScan { from { top:6%; } to { top:92%; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; } }
    @media (max-width: 900px) { .inspect-panel { right:10px; top:10px; bottom:10px; width:calc(100vw - 20px); } }
  </style>
</head>
<body class="mode-exact" data-active-route="${escapeHtml(firstRoute)}">
  <div class="transition-wipe"></div>
  <div class="preview-shell">
    <div class="canvas-wrap">
      <div class="stage-viewport">
        <div class="stage-stack" aria-label="METAWAR interactive preview">
${appScreens.map((item, index) => item.kind === 'figma' ? renderPixelScreen(item.screen, index === 0) : renderGeneratedScreen(item.route, index === 0)).join('\n')}
        </div>
      </div>
    </div>
    <aside class="inspect-panel" aria-hidden="true">
      <h1>METAWAR 转译预览</h1>
      <div class="mode-toggle"><button id="editableMode">可编辑重建</button><button id="exactMode" class="active">像素锁定</button></div>
      <h2>Screens</h2>
      <div class="screen-tabs">${ROUTES.map((route) => `<button data-route-target="${route.id}" class="${route.id === firstRoute ? 'active' : ''}">${route.key} ${escapeHtml(route.cn)} / ${escapeHtml(route.label)}</button>`).join('')}</div>
      <div class="node-meta">fileKey: ${escapeHtml(manifest.fileKey ?? '')}\nactive: ${escapeHtml(firstRoute)}\nroot: ${escapeHtml(screens[0]?.root?.id ?? '')}\nsize: ${Math.round(rootSize.width ?? 0)} x ${Math.round(rootSize.height ?? 0)}\nnodes: ${manifest.summary?.counts?.nodes ?? 0}\ninteraction: hot-zones + generated subviews enabled</div>
      <div class="ops-log" id="opsLog">[SYS] Pixel-lock visual layer ready.\n[SYS] Hover yellow regions or use keys 1-6 to navigate.</div>
      ${renderSummary('Colors', manifest.summary?.colors)}
      ${renderSummary('Typography', manifest.summary?.typography)}
      ${renderSummary('Radii', manifest.summary?.radii?.map((radius) => `${radius}px`))}
      ${renderSummary('Components', manifest.summary?.components?.map((component) => component.name || component.id))}
    </aside>
  </div>
  <script>
    const routeLabels = ${JSON.stringify(Object.fromEntries(ROUTES.map((route) => [route.id, `${route.key} ${route.cn}`])))};
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

    if (new URLSearchParams(location.search).get('debug') === '1') setInspectorVisible(true);
    addEventListener('resize', updateStageFit, { passive:true });
    requestAnimationFrame(updateStageFit);

    function log(line) {
      if (!opsLog) return;
      const stamp = new Date().toLocaleTimeString('zh-CN', { hour12:false });
      opsLog.textContent = ('[' + stamp + '] ' + line + '\\n' + opsLog.textContent).slice(0, 900);
    }

    function activateRoute(route, source = 'manual') {
      const next = screens.find((screen) => screen.dataset.route === route) || screens[0];
      if (!next) return;
      document.body.classList.remove('is-switching');
      void document.body.offsetWidth;
      document.body.classList.add('is-switching');
      screens.forEach((screen) => {
        const isActive = screen === next;
        screen.classList.toggle('active', isActive);
        screen.toggleAttribute('inert', !isActive);
        screen.setAttribute('aria-hidden', String(!isActive));
      });
      routeButtons.forEach((button) => button.classList.toggle('active', button.dataset.routeTarget === next.dataset.route));
      document.body.dataset.activeRoute = next.dataset.route;
      if (meta) meta.textContent = 'active: ' + next.dataset.route + '\\nname: ' + (next.dataset.name || routeLabels[next.dataset.route] || '') + '\\nsource: ' + source + '\\nmode: ' + (document.body.classList.contains('mode-exact') ? 'pixel-lock + interaction layer' : 'editable reconstruction');
      log('ROUTE -> ' + (routeLabels[next.dataset.route] || next.dataset.route) + ' via ' + source);
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

    document.querySelectorAll('[data-target-route]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        ripple(node, event);
        activateRoute(node.dataset.targetRoute, node.dataset.figmaName || node.dataset.action || 'hotspot');
      });
    });

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

function renderPixelScreen(screen, active) {
  const root = screen.root ?? { size: { width: 1440, height: 900 } };
  const rootNode = (screen.nodes ?? []).find((node) => node.id === root.id);
  const bodyNodes = (screen.nodes ?? []).filter((node) => node.box && node.id !== root.id);
  const stageBackground = rootNode?.fill ?? '#020406';
  return `        <section class="metawar-screen ${active ? 'active' : ''}" data-route="${escapeHtml(screen.route)}" data-name="${escapeHtml(screen.name)}" aria-hidden="${active ? 'false' : 'true'}" ${active ? '' : 'inert'}>
          <main class="figma-stage" aria-label="${escapeHtml(screen.name)}" style="--stage-w:${px(root.size?.width ?? 1440)};--stage-h:${px(root.size?.height ?? 900)};background:${escapeHtml(stageBackground)}">
            <div class="editable-layer">
${bodyNodes.map(renderNode).join('\n')}
            </div>
            ${renderExactLayer(screen.exactExports)}
            <div class="fx-layer"><div class="rain-field"></div><div class="scan-sweep"></div><div class="boot-flash"></div></div>
            ${renderInteractionLayer(screen)}
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

function renderInteractionLayer(screen) {
  const hotspots = buildHotspots(screen);
  return `<div class="interaction-layer">${hotspots.map((hotspot) => `<button class="hotspot" data-kind="${escapeHtml(hotspot.kind)}" data-target-route="${escapeHtml(hotspot.target)}" data-action="${escapeHtml(hotspot.label)}" data-figma-name="${escapeHtml(hotspot.source)}" style="${hotspotStyle(hotspot.box)}" aria-label="${escapeHtml(hotspot.label)}"><span class="hotspot-label">${escapeHtml(hotspot.label)}</span></button>`).join('')}</div>`;
}

function buildHotspots(screen) {
  const nodes = screen.nodes ?? [];
  const hotspots = [];
  const navFrames = nodes
    .filter((node) => node.type === 'FRAME' && node.box && node.box.y <= 80 && node.box.width >= 80 && node.box.height <= 48)
    .sort((a, b) => a.box.x - b.box.x);
  const navTargets = ['home', 'loadout', 'inventory', 'map'];
  navFrames.slice(0, navTargets.length).forEach((node, index) => hotspots.push({ kind: 'nav', target: navTargets[index], label: ROUTES.find((route) => route.id === navTargets[index])?.label ?? navTargets[index], source: node.name, box: expandBox(node.box, 0) }));

  for (const node of nodes) {
    if (!node.box || !['RECTANGLE', 'FRAME'].includes(node.type)) continue;
    const name = node.name ?? '';
    if (/主按钮|空降部署/.test(name)) hotspots.push({ kind: 'primary', target: 'map', label: '空降部署', source: name, box: node.box });
    else if (/底部按钮\s*枪匠|枪匠与配装/.test(name)) hotspots.push({ kind: 'footer', target: 'loadout', label: '枪匠与配装', source: name, box: node.box });
    else if (/底部按钮\s*战备|战备高墙/.test(name)) hotspots.push({ kind: 'footer', target: 'inventory', label: '战备高墙', source: name, box: node.box });
    else if (/底部按钮\s*医疗|医疗诊断/.test(name)) hotspots.push({ kind: 'footer', target: 'medical', label: '医疗诊断', source: name, box: node.box });
  }
  return dedupeHotspots(hotspots);
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

function renderExactLayer(exact) {
  const svg = exact?.svg?.publicPath;
  const png = exact?.png?.publicPath;
  const src = svg || png;
  if (!src) return '<div class="exact-layer" aria-hidden="true"></div>';
  return `<div class="exact-layer"><img src="${escapeHtml(src)}" alt="Pixel-locked Figma export" /></div>`;
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
