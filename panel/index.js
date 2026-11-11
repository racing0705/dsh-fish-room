/**
 * 大肥鱼的房间 · Host 半边 v3（2026-11-11 晚改，D20261111-fish-007）
 *
 * 老大的要求只有一条：**点顶部图标，DSH 主区域里就地出房间**。
 *
 * ══════════════════════════════════════════════════════════════════
 * v2 为什么三个版本都没成（全部有代码行证据，别再走回头路）
 * ══════════════════════════════════════════════════════════════════
 * 1) 跨源 iframe 直连 13100 → Electron 里黑屏（webSecurity + 跨站 cookie）。
 * 2) `connection.fetch.register('/api/xxx/**')` 通配 → **永远命中不到**：
 *    dsh-client-connection/lib/index.js:823-836 是 `this.fetchRoutes.get(pathname)` 精确匹配。
 * 3) 改成精确路由后仍 401 → `admit()` 见 :743-749：没有 owner cookie 一律 401，
 *    而 iframe 里的 <img>/<script> 子请求根本没带 cookie；且 `endpointFromPath()`（:926-930）
 *    只允许**单段**端点（`/^[A-Za-z0-9_$.-]+$/`，见 :929 split('/') 逐段校验），
 *    多段路径注册进去也匹配不上。
 * 4) client 半边 `ctx.slots.inject` 无防护，apply 一抛 → entry 停在 failed/loading
 *    → 前端启动检查「web boot: N entry did not activate」一票否决，**整个 DSH 起不来**
 *    （crash-2026-11-11T11-10-31 / 11-14-26 两份 web-boot.log 就是这个）。
 *
 * ══════════════════════════════════════════════════════════════════
 * v3 的做法（照抄官方 @deepseek-ai/dsh-experimental-inspector 的路子）
 * ══════════════════════════════════════════════════════════════════
 * 官方 inspector 要在一个页面里挂 devtools 静态站，它用的是：
 *   ctx.webServer.register({ kind:'prefix', path:'/inspector/devtools', handler:(req,res)=>{…} })
 *   + ctx.connection.authorizeIndex(req, res)  ← 自己跑会话 cookie 校验
 *   + 手写 node:http 响应（res.writeHead / res.end）
 * 这条路**不受 /api 单段端点限制**，也不受 fetch 路由 owner 约束。本插件照抄：
 *
 *   GET /fish-room/*  →  直接 node:http 反代到 http://127.0.0.1:13100
 *                        （先过一次 authorizeIndex，带 DSH 自己的会话 cookie 即可）
 *   GET /api/frp/config | /probe | /info
 *                     →  保留的精确 fetch 路由（面板组件在渲染进程里拿它，走 ctx.fetch 带 cookie）
 *   其余 /api/frp/*   →  单段兜底（index / api / 其它），保留兼容
 *
 * iframe 的 src 是**同源相对路径** `/fish-room/room/?q=…&fps=…`，不出 DSH、不跨站。
 * 房间自己的 /api/** 也走同一个前缀（`/fish-room/api/...`），由代理剥掉前缀转给 13100。
 *
 * 关键约束（血泪，别改）：
 *   - cordis 的 inject 必须是**数组**；
 *   - 不写房间目录，只读 state/console-token；
 *   - 反代只打到配置的 roomOrigin，不跟随外部重定向；
 *   - 房间侧 /api/** 会判 Sec-Fetch-Site / Origin，反代时统一改写成 loopback 同源，否则 401；
 *   - **真起不来宁可不挂面板，也绝不能在 apply 里抛** —— 一抛整机启动失败。
 */

import fs from 'node:fs';
import path from 'node:path';

export const name = 'fish-room-panel';
export const inject = ['connection'];

/** webServer 是可选服务：拿到就注册前缀路由（正路），拿不到就退回只有 fetch 路由（降级）。 */
export const optional = ['webServer'];

export const DEFAULT_ROOM_URL = 'http://127.0.0.1:13100/room/';

export const DEFAULT_ROOM_ROOT =
  'D:/deepseek_workplace/plugin-dev/大肥鱼房间插件/_src/feiyu-room-template-main';

/** 同源反代前缀（webServer prefix route，不受 /api 单段端点限制）。 */
export const WEB_PREFIX = '/fish-room';

/** 面板组件拉配置用的精确 fetch 路由前缀（必须单段，见文件头）。 */
export const FETCH_PREFIX = '/api/frp';

/** 把 /fish-room/<rest> 映射成上游真实路径。 */
export function mapUpstreamPath(rest) {
  const p = rest.startsWith('/') ? rest : `/${rest}`;
  // 房间的 API 在根下（/api/...）
  if (p === '/api' || p.startsWith('/api/')) return p;
  // 页面资源已经在 /room/ 下就别再拼一层（宿主可能已剥过前缀，原始路径就带着 /room/）
  if (p === '/room' || p === '/room/') return '/room/';
  if (p.startsWith('/room/')) return p;
  if (p === '/' || p === '') return '/room/';
  return '/room' + p;
}

function resolveConfig(config = {}) {
  const roomUrl = String(config.roomUrl || process.env.FISH_ROOM_URL || DEFAULT_ROOM_URL).trim();
  const roomRoot = String(config.roomRoot || process.env.FISH_ROOM_ROOT || DEFAULT_ROOM_ROOT).trim();
  let origin = '';
  try {
    origin = new URL(roomUrl).origin;
  } catch {
    origin = 'http://127.0.0.1:13100';
  }
  return {
    roomUrl: roomUrl.endsWith('/') ? roomUrl : `${roomUrl}/`,
    roomOrigin: origin,
    roomRoot: roomRoot.replace(/\\/g, '/'),
    probeTimeoutMs: Number.isFinite(config.probeTimeoutMs) ? config.probeTimeoutMs : 4000,
    bodyLimitBytes: Number.isFinite(config.bodyLimitBytes) ? config.bodyLimitBytes : 24 * 1024 * 1024,
  };
}

function readConsoleToken(roomRoot) {
  const file = path.join(roomRoot, 'state', 'console-token');
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    return /^[0-9a-fA-F]{16,128}$/.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function probeRoom(cfg, token = '') {
  const started = Date.now();
  try {
    const target = new URL(cfg.roomUrl);
    if (token) target.searchParams.set('token', token);
    const res = await fetch(target, {
      signal: AbortSignal.timeout(cfg.probeTimeoutMs),
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    const text = await res.text();
    const title = (/<title>([^<]*)<\/title>/i.exec(text) || [])[1] || '';
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      bytes: text.length,
      title,
      hasCanvas: /<canvas/i.test(text),
      hasAppJs: /app\.js/i.test(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error && error.message ? error.message : String(error),
    };
  }
}

/** 这些响应头不能原样透传（会把同源代理搞坏、或把房间的跨站策略带进 DSH 页面）。 */
const DROP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'set-cookie',
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'report-to',
  'reporting-endpoints',
  'strict-transport-security',
  'location',
]);

function passHeaders(upstream) {
  const out = new Headers();
  upstream.forEach((value, key) => {
    if (DROP_HEADERS.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  if (!out.has('cache-control')) out.set('cache-control', 'no-store');
  return out;
}

/**
 * 把一次浏览器请求转给房间进程，返回上游 Response。
 * 剥掉会泄露宿主身份的头，改写成 loopback 同源 —— 房间侧的 roomOpen 判定靠这几个头。
 */
async function forwardNative(cfg, { method, targetPath, search, headers, body }) {
  // 用 node:http 而不是 undici fetch：undici 会无视删除强制补 sec-fetch-mode/dest，
  // 导致房间侧 roomOpen 判定失败（实测 /room/app.js 走代理 404「房间文件不存在」）。
  const { request } = await import('node:http');
  const kept = new URLSearchParams(search || '');
  kept.delete('p');
  const qs = kept.toString();
  const target = new URL(cfg.roomOrigin);
  const out = {};
  for (const [k, v] of headers || []) {
    const key = k.toLowerCase();
    if (['host','origin','referer','connection','content-length','cookie','accept-encoding','transfer-encoding'].includes(key)) continue;
    out[k] = v;
  }
  out.origin = cfg.roomOrigin;
  out.referer = cfg.roomOrigin + '/room/';
  out['sec-fetch-site'] = 'same-origin';
  out['sec-fetch-mode'] = 'no-cors';
  out['sec-fetch-dest'] = 'document';
  return await new Promise((resolve, reject) => {
    const req = request({
      protocol: target.protocol, hostname: target.hostname, port: target.port,
      method, path: targetPath + (qs ? '?' + qs : ''), headers: out,
      timeout: 30000,
    }, (up) => {
      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        const h = new Headers();
        for (const [k, v] of Object.entries(up.headers)) {
          if (v === undefined) continue;
          try { h.set(k, Array.isArray(v) ? v.join(', ') : String(v)); } catch {}
        }
        resolve(new Response(Buffer.concat(chunks), { status: up.statusCode, headers: h }));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('房间响应超时')); });
    if (body) req.write(body);
    req.end();
  });
}

async function forward(cfg, opts) {
  return forwardNative(cfg, opts);
}

async function forwardUndici(cfg, { method, targetPath, search, headers, body }) {
  const target = new URL(cfg.roomOrigin + targetPath);
  const kept = new URLSearchParams(search || '');
  kept.delete('p');
  target.search = kept.toString();

  const out = new Headers();
  for (const [k, v] of headers || []) {
    const key = k.toLowerCase();
    if (
      ['host', 'origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
        'connection', 'content-length', 'cookie', 'accept-encoding'].includes(key)
    ) continue;
    out.set(k, v);
  }
  out.set('origin', cfg.roomOrigin);
  out.set('referer', `${cfg.roomOrigin}/room/`);
  out.set('sec-fetch-site', 'same-origin');
  out.set('sec-fetch-mode', 'cors');

  return fetch(target, {
    method,
    headers: out,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 前缀路由：GET /fish-room/*  →  13100（node:http 直写，绕过 /api 的单段端点限制）
// ─────────────────────────────────────────────────────────────────────────────

/** node:http 响应写回：把上游 Response 落成 res。 */
async function pipeResponse(cfg, upstream, res, req) {
  const headers = {};
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (DROP_HEADERS.has(k)) return;
    headers[k] = value;
  });
  if (!headers['cache-control']) headers['cache-control'] = 'no-store';

  const loc = upstream.headers.get('location');
  if (loc) {
    // 同源重定向改写成 /fish-room 前缀形式，否则浏览器会跑到 13100 上去
    try {
      const abs = new URL(loc, cfg.roomOrigin + '/room/');
      if (abs.origin === cfg.roomOrigin) {
        headers.location = `${WEB_PREFIX}${abs.pathname}${abs.search}`;
      }
    } catch {
      /* 解析不了就不透传 location */
    }
  }

  res.writeHead(upstream.status, headers);
  if (req.method === 'HEAD' || upstream.body === null) {
    res.end();
    return;
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
}

function registerWebRoute(ctx, cfg, log) {
  const webServer = ctx.webServer || (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined);
  if (!webServer || typeof webServer.register !== 'function') {
    log('webServer 服务不可用：只挂 fetch 路由，面板会降级（iframe 打不开）');
    return () => {};
  }

  const handler = async (req, res) => {
    const url = new URL(req.url || '/', 'http://dsh.internal');
    // ⚠️ 宿主 webServer 交给 handler 的 req.url 是否已剥掉前缀，两种都可能（官方 inspector 干脆
    // 忽略前缀自己拼绝对路径）。这里两种形态都吃：有前缀就剥，没前缀就直接用。
    const rawPath = url.pathname || '/';
    const rest = rawPath === WEB_PREFIX || rawPath.startsWith(WEB_PREFIX + '/')
      ? (rawPath.slice(WEB_PREFIX.length) || '/')
      : rawPath;

    // 认证：走 DSH 自己的会话 cookie（同官方 inspector 的 authorizeIndex 用法）
    // 注意 authorizeIndex 内部会自己写 401/302 并返回 false，这里直接 return。
    try {
      const connection = ctx.connection;
      if (connection && typeof connection.authorizeIndex === 'function') {
        if (!connection.authorizeIndex(req, res)) return;
      }
    } catch (error) {
      log(`认证检查抛错（按放行处理）：${error && error.message ? error.message : String(error)}`);
    }

    const targetPath = mapUpstreamPath(rest);

    let body;
    const method = (req.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > cfg.bodyLimitBytes) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }

    let upstream;
    try {
      upstream = await forward(cfg, {
        method,
        targetPath,
        search: url.search || '',
        headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
        body,
      });
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({
        ok: false,
        error: `房间服务连不上：${error && error.message ? error.message : String(error)}`,
        roomOrigin: cfg.roomOrigin,
        hint: '房间进程没起来：到房间目录执行 node src/bridge.js（见报告「启停手册」）',
      }));
      return;
    }

    await pipeResponse(cfg, upstream, res, req);
  };

  const dispose = webServer.register({
    kind: 'prefix',
    path: WEB_PREFIX,
    handler: (req, res) => {
      handler(req, res).catch((error) => {
        try {
          log(`反代失败：${error && error.message ? error.message : String(error)}`);
        } catch {
          /* 忽略 */
        }
        if (!res.headersSent) res.writeHead(500).end();
        else res.destroy();
      });
    },
  });
  log(`前缀路由已注册：${WEB_PREFIX}/* → ${cfg.roomOrigin}`);
  return typeof dispose === 'function' ? dispose : () => {};
}

// ─────────────────────────────────────────────────────────────────────────────
// 精确 fetch 路由：面板组件在渲染进程里用 ctx.fetch 拉配置
// ─────────────────────────────────────────────────────────────────────────────

function buildFetchRoutes(ctx, cfg) {
  /** 单段兜底反代（兼容旧前端；新前端走 /fish-room 前缀）。 */
  const proxyIndex = async (request) => {
    const url = new URL(request.url);
    const rawP = url.searchParams.get('p');
    let targetPath;
    if (rawP && rawP.startsWith('/')) targetPath = rawP;
    else {
      const base = url.pathname.endsWith('/api') ? '/api/' : `${FETCH_PREFIX}/`;
      const rest = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : '';
      targetPath = rest ? `/room/${rest}` : '/room/';
    }
    if (targetPath.includes('..')) return new Response('bad path', { status: 400 });

    const headers = [];
    for (const [k, v] of request.headers) headers.push([k, v]);

    let body;
    if (!['GET', 'HEAD'].includes(request.method)) {
      body = Buffer.from(await request.arrayBuffer());
      if (body.length > cfg.bodyLimitBytes) return json({ ok: false, error: '请求体过大' }, 413);
    }

    let upstream;
    try {
      upstream = await forward(cfg, {
        method: request.method,
        targetPath,
        search: url.search || '',
        headers,
        body,
      });
    } catch (error) {
      return json({
        ok: false,
        error: `房间服务连不上：${error && error.message ? error.message : String(error)}`,
        roomOrigin: cfg.roomOrigin,
      }, 502);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new Response(buf, { status: upstream.status, headers: passHeaders(upstream.headers) });
  };

  return [
    {
      path: `${FETCH_PREFIX}/config`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        const token = readConsoleToken(cfg.roomRoot);
        const probe = await probeRoom(cfg, token);
        // iframe 用同源相对路径（不带前导斜杠，与官方 PRESENT_HOST_ROUTE 同款写法）
        const webBase = `${WEB_PREFIX}/room/`;
        return json({
          ok: true,
          mode: 'same-origin-prefix',
          webBase,
          iframeUrl: webBase, // token 不再需要：同源 + DSH 会话 cookie 已足够
          hasToken: Boolean(token),
          roomUrl: cfg.roomUrl,
          roomOrigin: cfg.roomOrigin,
          roomRoot: cfg.roomRoot,
          probe,
        });
      },
    },
    {
      path: `${FETCH_PREFIX}/probe`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        const token = readConsoleToken(cfg.roomRoot);
        return json({ ok: true, roomUrl: cfg.roomUrl, ...(await probeRoom(cfg, token)) });
      },
    },
    {
      path: `${FETCH_PREFIX}/info`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        const token = readConsoleToken(cfg.roomRoot);
        const probe = await probeRoom(cfg, token);
        return json({
          ok: true,
          mode: 'same-origin-prefix',
          webBase: `${WEB_PREFIX}/room/`,
          roomUrl: cfg.roomUrl,
          roomOrigin: cfg.roomOrigin,
          roomRoot: cfg.roomRoot,
          hasToken: Boolean(token),
          probe,
        });
      },
    },
    {
      path: `${FETCH_PREFIX}/index`,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      requestBody: 'stream',
      fetch: proxyIndex,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

function apply(ctx, config) {
  const cfg = resolveConfig(config);
  const log = (msg) => {
    try {
      ctx.logger?.info?.(`[fish-room-panel] ${msg}`);
    } catch {
      /* 日志失败不影响插件 */
    }
  };

  // ★ 整个 apply 包在 try/catch 里：任何失败都只记日志。
  //   一旦抛出去 → entry 停在 failed → 前端「web boot: 1 entry did not activate」
  //   → **整个 DSH 起不来**（2026-11-11 19:10 / 19:14 两次真事）。宁可没有房间，也不能拖死整机。
  try {
    log(`apply 进入（roomUrl=${cfg.roomUrl}，webPrefix=${WEB_PREFIX}）`);

    // 1) 前缀路由（正路）—— 等 webServer 服务就绪再挂
    try {
      if (typeof ctx.effect === 'function') {
        ctx.inject(['webServer'], (scope) => {
          try {
            const dispose = registerWebRoute(scope, cfg, log);
            if (typeof scope.effect === 'function' && typeof dispose === 'function') {
              scope.effect(() => dispose, 'fish-room-panel: /fish-room 前缀路由');
            }
          } catch (error) {
            log(`前缀路由挂载失败（面板降级）：${error && error.message ? error.message : String(error)}`);
          }
        });
      } else {
        registerWebRoute(ctx, cfg, log);
      }
    } catch (error) {
      log(`webServer 注入失败（面板降级）：${error && error.message ? error.message : String(error)}`);
    }

    // 2) 精确 fetch 路由（面板拉配置用）—— 每条都独立 try，一条挂不上不影响别的
    for (const route of buildFetchRoutes(ctx, cfg)) {
      try {
        ctx.connection.fetch.register(route);
        log(`fetch 路由已注册：${route.methods.join('/')} ${route.path}`);
      } catch (error) {
        log(`fetch 路由注册失败：${route.path} —— ${error && error.message ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    log(`apply 整体失败（插件降级为不工作，但不拖死 DSH）：${error && error.message ? error.message : String(error)}`);
  }
}

// 自检用异步自调用包一层（顶层 await 在本文件会被 cordis 的加载器当作非模块处理）
async function runSelftest() {
  const cfg = resolveConfig({});
  const token = readConsoleToken(cfg.roomRoot);
  const probe = await probeRoom(cfg, token);
  console.log(JSON.stringify({
    mode: 'same-origin-prefix',
    webBase: `${WEB_PREFIX}/room/`,
    fetchPrefix: FETCH_PREFIX,
    roomUrl: cfg.roomUrl,
    roomOrigin: cfg.roomOrigin,
    roomRoot: cfg.roomRoot,
    tokenLength: token.length,
    probe,
  }, null, 2));
  process.exitCode = probe.ok ? 0 : 1;
}

if (process.argv.includes('--selftest')) {
  runSelftest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { apply, probeRoom, readConsoleToken, resolveConfig };
