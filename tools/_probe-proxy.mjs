/**
 * 同源代理逻辑离线自测：不启动 DSH，直接跑 index.js 里的 proxy 逻辑
 * （把 apply 拦下来，手工喂 request，看返回值）
 */
import { apply, resolveConfig, WEB_PREFIX } from '../plugins/dsh-fish-room-panel/index.js';

const cfg = resolveConfig({});
const routes = [];
const fakeCtx = {
  logger: { info: (m) => console.log('  ' + m) },
  connection: { fetch: { register: (r) => routes.push(r) } },
};
apply(fakeCtx, {});

const proxyRoute = routes.find((r) => r.path === `${WEB_PREFIX}/**`);
if (!proxyRoute) {
  console.error('找不到代理路由');
  process.exit(1);
}
console.log('注册的路由：', routes.map((r) => r.path).join(', '));

const base = 'http://127.0.0.1:57599'; // DSH 侧看到的地址（同源）

async function hit(path, opts = {}) {
  const req = new Request(base + path, { method: opts.method || 'GET', headers: opts.headers || {} });
  const res = await proxyRoute.fetch(req);
  const ct = res.headers.get('content-type') || '';
  const len = (await res.clone().arrayBuffer()).byteLength;
  return { status: res.status, ct, len, headers: res.headers };
}

const cases = [
  ['/api/fish-room/web/', '房间首页'],
  ['/api/fish-room/web/app.js', 'app.js'],
  ['/api/fish-room/web/world.js', 'world.js'],
  ['/api/fish-room/web/vendor/three.module.js', 'three.js'],
  ['/api/fish-room/web/assets/models/da-feiyu.opt.glb', '3D 模型 6.7MB'],
  ['/api/fish-room/web/garden.css', 'garden.css'],
  ['/api/fish-room/web/api/room/state', '房间 API（跨站敏感）'],
  ['/api/fish-room/web/api/home/state', 'home API'],
];

for (const [p, label] of cases) {
  try {
    const r = await hit(p);
    const okMark = r.status === 200 ? '✅' : '❌';
    console.log(`${okMark} ${String(r.status).padEnd(3)} ${String(r.len).padStart(9)} B  ${(r.ct.split(';')[0]).padEnd(26)} ${label}  ${p}`);
  } catch (e) {
    console.log(`💥 ${label} ${p} → ${e.message}`);
  }
}
