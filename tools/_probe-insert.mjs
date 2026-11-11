// 端到端模拟：临时 http 服务 + 插件代理（与 DSH 宿主同样的「精确路径匹配」语义）
// 2026-11-11 v3：除了精确路由，还要模拟宿主的「未知路径 → 401」；
// 同时把 /api/frp/<任意子路径> 也交给 proxyIndex（模拟浏览器相对路径 import 的真实行为）。
import http from 'node:http';
import { apply } from '../plugins/dsh-fish-room-panel/index.js';

const routes = [];
apply({ logger: { info() {} }, connection: { fetch: { register: (r) => routes.push(r) } } }, {});
console.log('registered routes:', routes.map((r) => `${r.methods.join('/')} ${r.path}`).join(' | '));

const INDEX_PATH = '/api/frp/index';

const PORT = 18777;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const clean = url.pathname.replace(/\/{2,}/g, '/');
  let route = routes.find((r) => r.path === clean && r.methods.includes(req.method));
  // 浏览器对 `import './world.js'` 的解析：文档 URL 是 …/index?p=…，相对路径会变成 …/world.js
  // 真实宿主会 401，这里为了验证 proxyIndex 的无-p 分支，把 /api/frp/* 都交给 index 路由
  if (!route && (clean.startsWith('/api/frp/') || clean === '/api/frp')) {
    route = routes.find((r) => r.path === INDEX_PATH);
  }
  if (route) {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (k !== 'host') headers[k] = v;
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }
    const upstream = new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body });
    try {
      const r = await route.fetch(upstream);
      const hdrs = Object.fromEntries(r.headers);
      delete hdrs['content-security-policy'];
      delete hdrs['x-frame-options'];
      res.writeHead(r.status, hdrs);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('proxy error: ' + (e && e.message));
    }
    return;
  }
  res.writeHead(401, { 'content-type': 'text/plain' });
  res.end('dsh auth needed');
});
server.listen(PORT, '127.0.0.1', () => console.log('test server on', PORT));
setTimeout(() => process.exit(0), 600000);
