/**
 * 大肥鱼的房间 · 面板组件
 *
 * 结构（对齐 dsh-memory-neuron 的「顶部工具条 + 舞台」两段式）：
 *   工具条：状态点 / 帧率 / 内存 / 画质档 / 开关（渲染、限帧）/ 重载
 *   舞台：同源 iframe 容器（房间页面本体），右上角浮一层性能 HUD
 *
 * ⚠ 2026-11-11 重做（D20261111-fish-006）：**不再跨源 embed**。
 *   上一版直接 iframe 到 http://127.0.0.1:13100/room/，在 DSH 桌面版（Electron）里
 *   一片黑——同源策略 / 混合内容 / 跨站 cookie 三道闸在 Electron 里比浏览器更严。
 *   v3（2026-11-11 20:00）：Host 半边改用 ctx.webServer.register({kind:'prefix'})
 *   把房间整站反代到同源 /fish-room/*（不受 /api 单段端点限制），iframe 直接嵌
 *   /fish-room/room/。**「新窗口打开」入口已删**（老大不要跳浏览器）。
 *
 * 性能治理四条：
 *   ① 24fps 限帧：房间页支持 ?fps=N，面板把参数透传下去。
 *   ② 面板一关就移除 iframe：DSH 切回对话主视图时 <iframe> 从 DOM 里摘掉，
 *      房间页的 rAF 循环随之销毁，GPU/CPU 归零。
 *   ③ document.hidden 时不渲染：同理，切到别的窗口就摘掉。
 *   ④ 大资产延迟加载：房间默认 charMode=webm（2D 立绘），6.7MB glb 只在点「3D」时加载。
 *
 * 配置只走 GET /api/frp/{config,probe,info}（单段端点）；本组件不写任何文件。
 */

const h = React.createElement;

const API = '/api/frp';

/**
 * 2026-11-11 血泪：面板组件跑在 DSH 渲染进程里，不能直接 fetch。
 * 宿主把认证/连接收在 connection 服务里（宿主侧 connection.fetch 路由要求 peer.principal.kind === 'owner'），
 * 直接 window.fetch('/api/fish-room/config') 拿到的是空 body → response.json() 抛
 * "Unexpected end of JSON input"。所以统一走 props.dshFetch / ctx.dshFetch / 兜底 window.fetch。
 */
/**
 * 官方 UI 插件（dsh-client-ui-deliverables）的写法：把 /api/xxx 去掉开头斜杠，
 * 以「相对根」的形式交给宿主 fetch —— 这样无论页面挂在什么子路径下都能命中精确 Fetch 路由。
 */
function dhUrl(path) {
  // 去掉开头的斜杠，留成相对根的形式（同官方 PRESENT_HOST_ROUTE = PRESENT_HOST_PATH.slice(1)）
  return ("" + "/api/frp" + path).slice(1);
}
let dshFetch = null;
function setDshFetch(fn) {
  if (typeof fn === "function") dshFetch = fn;
}
function getDshFetch() {
  return dshFetch || (typeof window !== "undefined" && typeof window.fetch === "function"
    ? window.fetch.bind(window)
    : null);
}
const PANEL_KEY = 'dsh-fish-room-panel';

/** 工具条上的小胶囊/小按钮样式，令牌跟主题走。 */
const CSS = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    height: '100%',
    minHeight: 560,
    padding: '4px 2px',
    color: 'var(--dsw-alias-text-primary, #e6edf7)',
    boxSizing: 'border-box',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-secondary, rgba(255,255,255,0.04))',
    border: '1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,0.08))',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: '18px',
    cursor: 'pointer',
    border: '1px solid rgba(120,220,255,0.22)',
    background: 'transparent',
    color: 'inherit',
    userSelect: 'none',
    textDecoration: 'none',
  },
  chipOn: {
    borderColor: 'rgba(120,220,255,0.65)',
    background: 'rgba(120,220,255,0.16)',
    color: '#d7f4ff',
  },
  chipOff: { opacity: 0.55 },
  stat: { fontSize: 12, opacity: 0.78, whiteSpace: 'nowrap' },
  dot: (on) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: on ? '#8fe0c0' : '#ff8f8f',
    boxShadow: on ? '0 0 8px rgba(143,224,192,0.85)' : 'none',
  }),
  stage: {
    position: 'relative',
    flex: 1,
    minHeight: 460,
    borderRadius: 12,
    overflow: 'hidden',
    background: 'radial-gradient(circle at 50% 42%, #101a2c 0%, #070a12 68%)',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  frame: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, display: 'block' },
  hud: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: '6px 10px',
    borderRadius: 10,
    background: 'rgba(6,12,20,0.72)',
    border: '1px solid rgba(120,220,255,0.24)',
    font: '11px/16px ui-monospace,SFMono-Regular,Menlo,monospace',
    color: '#cfe6ff',
    pointerEvents: 'none',
    whiteSpace: 'pre',
  },
  veil: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    fontSize: 13,
    color: '#cfe6ff',
    background: 'radial-gradient(circle at 50% 42%, #101a2c 0%, #070a12 68%)',
    textAlign: 'center',
    padding: 24,
    lineHeight: '22px',
    whiteSpace: 'pre-wrap',
  },
  veilErr: { color: '#ff9b9b' },
  loading: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 42%, #101a2c 0%, #070a12 68%)',
    textAlign: 'center',
    padding: 24,
  },
  spinner: {
    width: 34,
    height: 34,
    marginBottom: 14,
    borderRadius: '50%',
    border: '2px solid rgba(120,220,255,0.22)',
    borderTopColor: '#8fe0c0',
    animation: 'fishRoomSpin 1.05s linear infinite',
  },
};

/** 从 performance.memory 拿当前标签页 JS 堆（Chrome 系有，别的浏览器没有就返回 null）。 */
function readHeapMB() {
  const mem = performance && performance.memory;
  if (!mem || !mem.usedJSHeapSize) return null;
  return Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10;
}

/**
 * 房间面板主体。
 * @param {object} props slot 传进来的标准 prop（含 usePanelInfo），用来判断自己是不是当前主面板
 */
function FishRoomPanel(props) {
  const hostRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const [cfg, setCfg] = React.useState(null);
  const [probe, setProbe] = React.useState(null);
  const [error, setError] = React.useState('');
  // 加载态：iframe 的 onLoad 只表示文档载入，房间自己的 boot() 还要 250~600ms 才隐藏 loader。
  const [loaded, setLoaded] = React.useState(false);
  const [waitMs, setWaitMs] = React.useState(0);
  const [fps, setFps] = React.useState(0);
  const [heap, setHeap] = React.useState(null);
  const [quality, setQuality] = React.useState(() => localStorage.getItem('fish-room-q') || 'balanced');
  // 房间侧限帧（app.js 支持 ?fps=N）。0 = 不限帧，与房间默认 24 区分开。
  const [fpsCap, setFpsCap] = React.useState(() => {
    const raw = localStorage.getItem('fish-room-fps');
    return raw === null ? 24 : Number(raw) || 0;
  });
  const [mounted, setMounted] = React.useState(true);
  const [paused, setPaused] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // ── 自己是不是当前主面板：不是的话 iframe 直接不挂（这是最省的一条）
  const usePanelInfo = props && typeof props.usePanelInfo === 'function' ? props.usePanelInfo : null;
  const hook = usePanelInfo || function () { return undefined; };
  const activePanel = hook(function (info) {
    return info && info.activePanelId ? info.activePanelId : null;
  });
  const isActive = activePanel === undefined || activePanel === null ? true : activePanel === PANEL_KEY;

  // ── 拉配置（webBase + token + probe）
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = getDshFetch(); if (!f) throw new Error('宿主 fetch 不可用'); const res = await f(dhUrl('/config'));
        const data = await res.json();
        if (!alive) return;
        if (!data || data.ok !== true) throw new Error((data && data.error) || '返回体不合法');
        setCfg(data);
        if (data.probe) setProbe(data.probe);
      } catch (err) {
        if (alive) setError(err && err.message ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── 探活（进面板先探一次，之后每 30 秒一次，服务挂了就红字）
  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const f = getDshFetch(); if (!f) throw new Error('宿主 fetch 不可用'); const res = await f(dhUrl('/probe'));
        const data = await res.json();
        if (alive && data && typeof data.ok === 'boolean') setProbe(data);
      } catch {
        /* 探活失败保持上一次结果 */
      }
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // ── 页面可见性：切到别的窗口时把 iframe 也摘掉，回来再挂
  React.useEffect(() => {
    const onChange = () => setHidden(document.hidden === true);
    document.addEventListener('visibilitychange', onChange);
    onChange();
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // 切画质/重载/换限帧时重置加载态
  React.useEffect(() => {
    setLoaded(false);
    setWaitMs(0);
  }, [nonce, quality, fpsCap]);

  // 加载计时：未 loaded 时每秒 +1（用来给「等了多久」和 8 秒提示）
  React.useEffect(() => {
    if (loaded) return undefined;
    const timer = setInterval(() => setWaitMs((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [loaded, nonce, quality, fpsCap]);

  // ── 帧率采样：只量 DSH 这个标签页的 rAF 频率
  React.useEffect(() => {
    let frames = 0;
    let last = performance.now();
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        setHeap(readHeapMB());
        frames = 0;
        last = now;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toggleMount = () => setMounted((v) => !v);
  const togglePause = () => setPaused((v) => !v);

  const pickQuality = () => {
    const next = quality === 'low' ? 'balanced' : 'low';
    localStorage.setItem('fish-room-q', next);
    setQuality(next);
    setNonce((n) => n + 1);
  };

  // ── 组装 iframe URL：同源路径 + token + 画质档 + 限帧
  const iframeUrl = React.useMemo(() => {
    if (!cfg || !cfg.iframeUrl) return '';
    const u = new URL(cfg.iframeUrl, location.origin);
    u.searchParams.set('q', quality);
    u.searchParams.set('fps', String(fpsCap));
    u.searchParams.set('_t', String(nonce));
    return u.toString();
  }, [cfg, quality, nonce, fpsCap]);

  const shouldMount = Boolean(iframeUrl) && mounted && !paused && !hidden && isActive;
  const fpsColor = fps >= 50 ? '#8fe0c0' : fps >= 30 ? '#ffd591' : '#ff9b9b';
  const online = Boolean(probe && probe.ok);

  return h(
    'div',
    { style: CSS.wrap, 'data-fish-room-panel': 'wrap' },
    // ── 工具条
    h(
      'div',
      { style: CSS.toolbar },
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 } },
        h('span', { style: CSS.dot(online) }),
        probe ? (probe.ok ? '房间在线' : '房间离线') : '探活中…'),
      probe && probe.ok
        ? h('span', { style: CSS.stat }, `${probe.title || '房间'} · ${probe.bytes} B · ${probe.ms} ms`)
        : null,
      cfg && cfg.webBase
        ? h('span', { style: { ...CSS.stat, opacity: 0.55 } }, '同源')
        : null,
      h('span', { style: { flex: '1 1 auto' } }),
      h('span', { style: { ...CSS.stat, color: fpsColor } }, `宿主 ${fps} fps`),
      h('span', { style: CSS.stat }, heap === null ? '堆内存 —' : `堆 ${heap} MB`),
      h('button', {
        type: 'button',
        title: '在标准画质（像素比 1.35、开阴影）与低画质（像素比 1.0、关阴影）之间切换',
        style: { ...CSS.chip, ...(quality === 'low' ? CSS.chipOn : null) },
        onClick: pickQuality,
      }, quality === 'low' ? '画质：低' : '画质：标准'),
      h('button', {
        type: 'button',
        title: mounted ? '摘下 iframe（房间页的 rAF 循环随之销毁）' : '重新挂上 iframe',
        style: { ...CSS.chip, ...(mounted ? CSS.chipOn : CSS.chipOff) },
        onClick: toggleMount,
      }, mounted ? '渲染：开' : '渲染：关'),
      h('button', {
        type: 'button',
        title: '暂停 = 与「渲染关」同效，但保留意图标记',
        style: { ...CSS.chip, ...(paused ? CSS.chipOff : CSS.chipOn) },
        onClick: togglePause,
      }, paused ? '已暂停' : '运行中'),
      h('button', {
        type: 'button',
        title: '房间渲染帧率上限（改的是房间页的 ?fps= 参数）',
        style: { ...CSS.chip, ...(fpsCap === 24 ? CSS.chipOn : null) },
        onClick: () => {
          const next = fpsCap === 24 ? 0 : 24;
          localStorage.setItem('fish-room-fps', String(next));
          setFpsCap(next);
          setNonce((n) => n + 1);
        },
      }, fpsCap === 24 ? '限帧 24' : '不限帧'),
      h('button', {
        type: 'button',
        title: '重新加载房间页',
        style: CSS.chip,
        onClick: () => setNonce((n) => n + 1),
      }, '重载'),
    ),
    // ── 舞台
    h(
      'div',
      { style: CSS.stage, ref: hostRef },
      // iframe 只在需要时挂；同源了，不需要 sandbox / referrerPolicy 特殊处理
      shouldMount
        ? h('iframe', {
            key: `${nonce}-${quality}-${fpsCap}`,
            src: iframeUrl,
            style: CSS.frame,
            title: '大肥鱼的房间',
            allow: 'autoplay; fullscreen',
            onLoad: () => setLoaded(true),
          })
        : null,
      // 加载中（不是错误）：渐变底 + 呼吸圈 + 已等秒数
      shouldMount && !loaded && !error
        ? h('div', { style: CSS.loading },
            h('div', { style: CSS.spinner }),
            h('div', { style: { fontSize: 13, color: '#cfe6ff' } }, '正在把她的家打开…'),
            h('div', { style: { fontSize: 11, opacity: 0.6, color: '#cfe6ff', marginTop: 6 } },
              waitMs >= 8
                ? `已等 ${waitMs} 秒。房间服务在线，但页面还没报就绪——点「重载」再试，仍不行就看她是不是在加载 3D 模型。`
                : `已等待 ${waitMs} 秒`))
        : null,
      // 未挂载时给的说明（不是错误，是省资源）
      !shouldMount && !error && online
        ? h('div', { style: CSS.veil },
            hidden
              ? '页面不在前台，已暂停渲染。\n切回来自动恢复。'
              : !isActive
                ? '当前不在房间面板上，已暂停渲染。\n点回房间面板即可继续。'
                : !mounted || paused
                  ? '渲染已手动关闭。\n房间进程还在跑（13100 端口没停），点「渲染：开」恢复画面。'
                  : '正在准备房间…')
        : null,
      // 房间进程没起来 / 代理打不通：给可读错误，不叫「白屏」
      probe && probe.ok === false
        ? h('div', { style: { ...CSS.veil, ...CSS.veilErr } },
            '房间服务没连上。\n',
            `地址：${(cfg && cfg.roomOrigin) || 'http://127.0.0.1:13100'}\n`,
            probe.error ? `原因：${String(probe.error).slice(0, 200)}\n` : '',
            '她没在跑：到房间目录执行 node src/bridge.js 拉起来（报告里有启停手册）。')
        : null,
      error ? h('div', { style: { ...CSS.veil, ...CSS.veilErr } }, `读不到房间配置：${error}`) : null,
      // ── 性能 HUD（浮在右上角，不挡操作）
      h('div', { style: CSS.hud },
        `宿主 fps  ${fps}\n`,
        `堆内存    ${heap === null ? '—' : `${heap} MB`}\n`,
        `画质      ${quality}\n`,
        `限帧      ${fpsCap === 0 ? '不限' : `${fpsCap} fps`}\n`,
        `iframe    ${shouldMount ? (loaded ? '已挂载' : '加载中') : '已摘除'}`),
    ),
  );
}

const SLOT = 'settings.section';
const SECTION = { name: SLOT, id: 'fish-room', order: 122, label: '大肥鱼的房间' };
const MAIN_PANEL_ID = 'dsh-fish-room-panel';
const name = 'fish-room-panel';

/**
 * client 半边必须显式声明依赖的服务。
 * 漏了这行 → ctx.slots 为 undefined → 两个 register 当场抛错被 loader 吞掉，
 * 表现是「按钮在、点一下报 main panel "xxx" is not registered」。
 */
const inject = ['slots'];

/** 只记日志、绝不抛 —— 一个面板插件不许把整机启动拖死。 */
function warn(msg, error) {
  try {
    console.warn('[房间面板] ' + msg, error && error.message ? error.message : (error || ''));
  } catch {
    /* 忽略 */
  }
}

/** ctx.slots.inject 的保险版：宿主不支持 inject 时退回直接 register。 */
function safeInject(ctx, slot, factory) {
  try {
    if (typeof ctx.slots.inject === 'function') ctx.slots.inject(slot, factory);
    else factory();
  } catch (error) {
    warn('槽位 ' + slot + ' 注册失败', error);
  }
}

function apply(ctx) {
  // ★ 2026-11-11 血泪：这里绝不能抛。
  //   client 半边 apply 一抛 → 前端启动检查「web boot: 1 entry did not activate」
  //   是一票否决制，整个 DSH 直接起不来（crash-2026-11-11T11-10-31 / 11-14-26 两次真事）。
  //   所以整段包 try/catch，槽位拿不到就只 warn 并退出，不要连累宿主。
  try {
    // 宿主注入的 fetch（带 owner 认证）；拿不到就退回 window.fetch
    try {
      if (ctx && typeof ctx.fetch === 'function') setDshFetch(ctx.fetch);
      if (ctx && typeof ctx.dshFetch === 'function') setDshFetch(ctx.dshFetch);
    } catch (error) {
      warn('取宿主 fetch 失败，退回 window.fetch', error);
    }

    if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') {
      warn('ctx.slots 不可用，面板不注册（宿主其它功能不受影响）');
      return;
    }

    safeInject(ctx, SLOT, function () {
      return ctx.slots.register({ ...SECTION }, FishRoomPanel);
    });
    safeInject(ctx, 'main', function () {
      return ctx.slots.register({ name: 'main', key: MAIN_PANEL_ID }, FishRoomPanel);
    });
    console.info('[房间面板] 已注册：settings.section(fish-room) + main(' + MAIN_PANEL_ID + ')');
  } catch (error) {
    warn('apply 整体失败，面板不工作但不影响宿主', error);
  }
}
exports.name = name;
exports.inject = inject;
exports.apply = apply;
exports.MAIN_PANEL_ID = MAIN_PANEL_ID;
exports.FishRoomPanel = FishRoomPanel;
