# 犯过的错误全集

> 这个文件是这份仓库**最有价值的部分**。代码谁都能读，但这些坑都是一条一条撞出来的。
> 每一条都写成「现象 → 我当时以为 → 真实原因（带代码行证据）→ 正确做法 → 代价」。
> 换电脑重来时，先把这份读完，能省掉我们这两天里的 80%。

---

## 一、取件阶段

### E01 · GitHub 直连下 56MB 的包，永远下不完

**现象**：`curl` 下 `codeload.github.com/sh2234113/feiyu-room-template/archive/refs/heads/main.zip`，每次下到 2.2~8.2 MB 就断，`curl exit 28`（超时），偶尔 `http=000`。

**我当时以为**：被墙了 / 仓库 404 / 文件太大被限速。

**真实原因**：**不是被墙、不是 404**。`curl -sI` 返回 `HTTP/1.1 200 OK`、`Content-Type: application/zip`、`x-github-edge-region: southeastasia`。是这条链路对持续大流量不稳定，20~30 KB/s 的速率撞上默认超时。仓库里有 `anime maid 3d model.glb` —— 未压缩 58,885,308 B（56 MB），deflate 后也有 30 MB，这是下载失败的直接原因。

**正确做法**：用镜像。

```bash
curl -sL --max-time 120 -o full.zip \
  "https://gh-proxy.com/https://github.com/sh2234113/feiyu-room-template/archive/refs/heads/main.zip"
# 27.7 秒下完 86,907,128 B，212 个 entry，zipfile.testzip() 返回 None
```

镜像实测对比：

| 镜像 | 25s 内下载量 | 结论 |
|---|---|---|
| `gh-proxy.com` | **86.9 MB（完整）** | ✅ 用这个 |
| `ghfast.top` | 21.4 MB | 能用但要续传 |
| `ghproxy.net` | 299 KB | ❌ 基本没用 |
| codeload 直连 | ~30 KB/s | ❌ 900 秒下不完 |

**代价**：绕了 8 次坏包，收了 11 个半截 zip（`v2.zip` / `v3.zip` / `p1..p8.zip`），还写了个 112 行的 `fix_download.py` 试图用 `zlib.decompressobj(-15)` 逐条重算 local header 长度、自建 Central Directory 把半个 zip 修好——脚本本身逻辑没错，但 urllib 读 30MB 在同一条链路上也是卡死的，跑了 600~900 秒超时。**这个修复脚本完全没必要写，镜像一秒钟就解决了。**

### E02 · 半截 zip 会骗人：`zipfile` 报 BadZipFile 但内容其实是好的

**现象**：所有下到的片段 `zipfile.ZipFile()` 抛 `BadZipFile: File is not a zip file`，`d.rfind(b'PK\x05\x06')` 返回 -1。

**真实原因**：zip 的目录结构在**尾部**（EOCD + Central Directory）。下载被砍在中间，尾部没到，所以 Python 认为这不是 zip。但**前半部分是完全有效的**：完整 zip 头 + 若干完整的 local entry。

**正确做法**：我只想读文件清单的话，不需要 EOCD。直接扫 local file header 魔数 `PK\x03\x04`，读它的 `compressed_size` / `uncompressed_size` / `filename`，就能把目录结构全解出来。这次仓库的 16 个 entry 就是这么拿到的（前面 `_dl` 那一堆坏包唯一的正面价值）。

**但更正确的一句话是**：别修坏包，换镜像重下。

### E03 · `.gitignore` 里的 `.npmrc` 22 字节陷阱

（这条较轻，但说明了一个模式）从 local header 解出来的 16 个 entry 里有个 `.npmrc` 只有 22 字节，里面是 `onlyBuiltDependencies` 之类的 pnpm 配置。它不影响使用，但如果照着它去配 pnpm 会以为项目有特殊设置。**读到的每个小文件都要打开看一眼再决定要不要照做。**

---

## 二、安装阶段

### E04 · 作者文档里的端口是错的

**现象**：README.md 第 117 行、SETUP.md 第 224/231/321/324/352 行，通篇写 `http://127.0.0.1:13100/room/`。照着访问 → `connection refused`。

**真实原因**：代码 `src/bridge.js:3398` 是 `const port = cfg.consolePort ?? 3100;`，`config.example.json` 默认 `consolePort: 3100`。**文档写 13100，代码默认 3100。**

**正确做法**：把 `config.json` 的 `consolePort` 改成 `13100`，与文档对齐。（改代码默认值也行，但改配置更安全。）

**教训**：**作者文档和作者代码不一致时，信代码。**

### E05 · `dsh.baseUrl` 硬编码，DSH 一重启就失联

**现象**：房间日志刷 `DSH 事件流已结束（本次收到 0 帧）` + `⚠️ 连续多次连上 DSH 事件流后一帧都没收到就断开：多半是 DSH 侧事件流协议/版本不匹配（…见 issue #34）`。

**我当时以为**：DSH 的 SSE 协议改了，是版本不兼容。

**真实原因**：`config.json` 里 `dsh.baseUrl` 默认 `http://127.0.0.1:3080`，本机 DSH 端**每次启动端口都变**（因为用 `--port 0` 随机端口）。

实测端口序列（一天之内）：

```
61901 → 57599 → 64599 → 54402 → 55475 → 55692 → 56502
      → 57131 → 57132 → 57815 → 58860 → 59451 → 60390 → 62345
```

**正确做法**：每次 DSH 重启后，改 `config.json` 的 `dsh.baseUrl` 到新端口，再重启房间进程。

正确的日志长这样（三行健康）：
```
本地控制台已启动：http://127.0.0.1:13100
SnowLuma 已连接：ws://127.0.0.1:6700
DSH 已就绪（模式: reserved2）
```

**代价**：这一条我们反复踩了 6 次以上，每次都以为是「协议不兼容」去查代码，其实只是端口变了。**这是整份记录里最浪费时间的一条。**

### E06 · `consolePort` 不能改成 3080（会和 DSH 撞）

如果为了「少改一个配置」把房间的 `consolePort` 设成 DSH 的端口，房间起来就会和 DSH 抢端口。**两个服务必须分开端口。**

### E07 · SnowLuma 默认端口全错

**现象**：`config.json` 默认 `snowluma.wsUrl = ws://127.0.0.1:3001`、`httpUrl = http://127.0.0.1:3000`，启动后 QQ 侧一直 `code=1006` 重连。

**真实原因**：本机 SnowLuma 的 OneBot v11 实际端口是 **6700（WS）** 和 **6701（HTTP）**，不是作者的 3000/3001。

**正确做法**：
```json
"snowluma": { "wsUrl": "ws://127.0.0.1:6700", "httpUrl": "http://127.0.0.1:6701" }
```
探活命令：`curl -X POST http://127.0.0.1:6701/get_login_info`，正常返回 `{"status":"ok","retcode":0,"data":{"user_id":…,"nickname":"…"}}`。（6700 是 WS，GET 会返回 `Upgrade Required`，这是对的。）

### E08 · Windows 上 `0600 权限` 测试失败是误报

**现象**：作者自带测试 `test:room` 17 过 1 失，`test:home` 26 过 1 失，失败的都同一句：
```
✗ save / load 原子落盘，0600 权限
438 !== 384
```

**真实原因**：438 = `0o666`，384 = `0o600`。源码 `src/room-state.js:130` 和 `src/home-state.js:613` 都写了 `fs.writeFileSync(tmp, …, { mode: 0o600 })`，但 **Windows NTFS 不支持 POSIX 权限位**，`fs.statSync().mode` 恒返 `0o666`。

**正确做法**：**不用修**。真正的保护在 ACL：`icacls state/home.json` 显示 `Administrators:(F)` / `SYSTEM:(F)` / `Administrator:(F)` 带 `(I)` 继承，等效 0600。在 Windows 上验证权限要看 ACL 不看 mode。

---

## 三、挂进 DSH 面板阶段（踩得最惨的一段）

### E09 · ★ 组件一抛错，整个 DSH 起不来

**现象**：双击 DSH，弹「DeepSeek 无法使用」，主窗口根本不出。日志：
```
web boot: 1 entry did not activate
dsh-fish-room-panel: failed     ← 或 loading
```
栈顶 `at file:///D:/deepseek/resources/app/lib/main.js:12496:15`

**真实原因**：前端（`dsh-web-frontend/dist/assets/index-*.js`）启动时遍历 loader.entries()，**只要有一个不是 `active` 就 `throw new Error('web boot: N entry did not activate ...')`** —— 一票否决。状态映射是 PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING。

我的面板插件 `client.js` 的 `apply(ctx)` 里第一句就是 `ctx.slots.inject(...)`，这个调用当场抛错（原因见 E11），于是 entry 停在 `failed`，**整个 DSH 起不来**。

**正确做法**（两层防护，都要有）：

```js
// 1) 所有 inject 都包 try/catch，抛错只 warn
function safeInject(ctx, slot, factory) {
  try {
    if (ctx && ctx.slots && typeof ctx.slots.inject === 'function') {
      ctx.slots.inject(slot, factory);
    } else {
      warn('ctx.slots.inject 不可用，直接执行 factory');
      factory();
    }
  } catch (e) {
    warn('inject 失败', e);   // 只警告，不向上抛
  }
}

// 2) apply 整段包 try/catch
export function apply(ctx) {
  try {
    ...
  } catch (e) {
    console.warn('[fish-room-panel] apply 失败，面板不可用但不影响 DSH 启动', e);
  }
}
```

**代价**：老大某天晚上 DSH 直接打不开，自己手动去 `cordis.patch.yml` 里加 `disabled: true` 才救回来。**这是整件事里最严重的一次事故。**

**额外教训**：改插件期间应该有「试装」的概念——改完先用 `node --check` + 沙箱 vm 装载测试，确认 apply 不抛，再启用。我们后来补了 `panel/_diag-client.cjs`（用 `vm` + 假 `window.__ModuleLoader__` 跑四种环境：正常 / `ctx.slots` 缺失 / `slots.inject` 抛错 / `ctx` 全空），四种都 `applyOk:true` 才算过。

### E10 · ★ `connection.fetch.register` 的通配路由永远命中不到

**现象**：我注册了 `/api/fish-room/**` 想当反代入口，注册成功（没报错），但请求全落空。

**我当时以为**：路由匹配写错了 / 方法不对 / 被 CSP 拦了。

**真实原因**（`D:\deepseek\resources\app\dsh\node_modules\@deepseek-ai\dsh-client-connection\lib\index.js`）：

```js
// :823-836  createSharedFetchHandler
const pathname = new URL(request.url).pathname;
const route = this.fetchRoutes.get(pathname);          // ← 精确 map.get，没有 glob
if (route?.methods.has(request.method) === true) {
  if (peer.principal.kind !== "owner") return new Response("forbidden", { status: 403 });
  return route.fetch(request);
}
return new Response("not found", { status: 404 });
```

**`fetchRoutes` 是 `Map`，`get(pathname)` 是精确字符串匹配。`/**` 能注册进去，但永远不会被 `get` 到。**

**正确做法**：不要用 `connection.fetch.register` 挂静态站/反代。用 **`ctx.webServer.register({ kind: 'prefix', path })`**（见 E12）。

### E11 · 精确 fetch 路由也 401，且只允许单段端点

**现象**：就算注册精确路径 `/api/fish-room/config`，从面板里 fetch 也是 401。

**真实原因**：
- `dsh-client-connection/lib/index.js:743-749` 的 `admit()`：`if (this.browserAuth.isAuthenticated(request, secure)) return { peer: this.browserPeer };` 否则 `return { rejection: 401 }` —— **必须是 owner cookie 认证过的请求**。iframe 里 `<img>` / `<script>` 发出的子请求**不带 cookie**，必然 401。
- 同文件 `:926-930` 的 `endpointFromPath(channel, pathname)` 要求 `/api/` 后面是**单个路径段**，段名必须匹配 `ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/`（`:690`）。多段路径（`/api/fish-room/config`）注册进去了也匹配不上。

**正确做法**：同上，走 `webServer.register({kind:'prefix'})`，然后**自己做认证**——调用 `ctx.connection.authorizeIndex(req, res)`。

### E12 · 正确姿势：照抄官方 `dsh-experimental-inspector`

官方要在页面里挂 devtools 静态站，它用的是（`dsh-experimental-inspector/lib/index.js:2426-2448`）：

```js
disposers.push(ctx.webServer.register({
  kind: 'prefix',
  path: DEVTOOLS_PATH,            // "/inspector/devtools"
  handler: (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    if (!ctx.connection.authorizeIndex(req, res)) return;   // ← 认证自己做
    ... serveStatic ...
  }
}));
```

配套的 inject 写法（`dsh-host-frontend-static/lib/index.js:21`）：`inject = ["webServer", "connection"]`。

**结论**：`kind:'prefix'` 不受 `/api` 单段端点限制，也不需要 fetch 路由的 owner 认证——只要自己调 `authorizeIndex`。

### E13 · undici fetch 会强行补回 `sec-fetch-*` 头

**现象**：反代到房间（`127.0.0.1:13100`）后，页面能出来，但 API 全 401。我把 `sec-fetch-site` / `sec-fetch-mode` 删掉再转发，还是 401。

**真实原因**：Node 的 `fetch`（undici）**会自动补 `sec-fetch-*` 头**。你手动删掉 `sec-fetch-mode`，它填回 `cors`；房间的 `roomOpen` 判定（`src/bridge.js:3783-3820`）要求 `secFetchSite ∈ {空, same-origin, none}` 且 Origin 在白名单，`cors` / `cross-site` 直接落 401。

**正确做法**：**别用 undici `fetch` 转发，用 `node:http` 的 `request()`**：

```js
import http from 'node:http';

function forwardNative(target, headers, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, {
      method,
      headers: {
        ...headers,
        host: target.host,
        origin: ROOM_ORIGIN,
        referer: ROOM_ORIGIN + '/room/',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'no-cors',      // ← 关键
        'sec-fetch-dest': 'document',
      },
    }, (res) => resolve(res));
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('upstream timeout')));
    req.end();
  });
}
```

`node:http` 不会替你补这些头，写什么就是什么。

### E14 · 前端硬编码前缀 → 直连和反代两种访问方式互相打架

**现象**：反代能出页面了，但直接访问 `http://127.0.0.1:13100/room/` 变白屏（`tick=0`，canvas 300×150 默认尺寸）。

**真实原因**：我在 `index.html` 的引导脚本里写死了 `/fish-room/room/` 前缀。直连时子资源被拼成 `/fish-room/room/app.js` → 404 → app.js 根本没加载。

**正确做法**：**按当前路径自适应前缀**：

```js
const i = location.pathname.indexOf('/room/');
const WEB_PREFIX = i >= 0 ? location.pathname.slice(0, i + 6) : '/room/';  // '/room/' 或 '/fish-room/room/'
const API_PREFIX = i >= 0 ? location.pathname.slice(0, i) : '';            // '/api/' 或 '/fish-room/api/'
```

**教训**：一个页面同时要能「直连」和「被反代」，所有前缀都不能写死，必须从 `location` 推。

### E15 · ★ 引导脚本把 `<script src="./app.js">` 吃掉 → 静默白屏

**现象**：页面只剩 loading 转圈，canvas 是 300×150 默认尺寸，`__fishRoomRenderTick` 永远是 0，但**控制台一个错误都没有**。

**真实原因**：上一版我写了个内联引导脚本，用来把 token 塞进子资源 URL。它的逻辑是：

```js
var t = new URLSearchParams(location.search).get('token');
if (!t) return;                      // ← 没有 token 就直接 return
// 有 token 才动态插入 <script src="./app.js?token=...">
```

**URL 不带 token 时，它 `return` 了，于是 app.js 从头到尾没有被加载。** 而且不报错——因为没有任何东西"失败"，只是没执行。

**正确做法**：**永远不要用脚本替换掉原本的 `<script src>` 标签**。要注入 token 就改 `app.js` 自己的取值逻辑（读 `params.get('token') || window.__dshRoomToken || ''`），不要把 `<script>` 标签本身当变量。

**教训**：**白屏但零报错，第一件事就去看 `document.scripts` —— `src` 为 null 的那一条就是凶手。**

### E16 · 重复行导致语法错误，且 `node --check` 会误报

**现象**：`node --check index.js` 报 `SyntaxError: Unexpected token 'export'`。

**真实原因**：两件事混在一起：
1. `node --check` 对带 `export` 的 ESM 文件在 CJS 判定下**会误报**这个错——这个报错本身没意义。
2. 但同一轮里有个真的语法错误：`ops_edit_file` 替换时 `if (!['GET','HEAD'].includes(request.method)) {` **出现了两遍**（第 184/185 行），括号没闭合。

**正确做法**：写了个括号平衡扫描器 `panel/_diag-client.cjs` 的思路（原版是 `_diag.mjs`），逐字符扫 `{}()[]` 栈，定位到「line 142 起的一个 `{` 未闭合」。**ESM 文件不要用 `node --check`，用括号扫描器或 `node --input-type=module --check`。**

### E17 · 顶层 `await` 在 `--selftest` 分支里是致命伤

**现象**：`node index.js --selftest` 报 `SyntaxError: Unexpected reserved word`。

**真实原因**：我写了 `if (process.argv.includes('--selftest')) { await runSelftest(); }` —— 顶层 await 在 CJS 判定下不合法。

**正确做法**：
```js
if (process.argv.includes('--selftest')) {
  runSelftest().catch((e) => { console.error(e); process.exit(1); });
}
```

### E18 · ★ Electron 把 `target=_blank` 交给系统浏览器

**现象**：老大点面板里的按钮，直接弹出 Chrome 打开 `http://127.0.0.1:13100/room/`。原话：「现在点开要进到谷歌网页」。

**真实原因**（`D:\deepseek\resources\app\lib\main.js:12024`）：

```js
window.webContents.setWindowOpenHandler(({ url }) => {
  if (['http:', 'https:'].includes(new URL(url).protocol)) shell.openExternal(url);
  return { action: 'deny' };
});
```

**DSH 外壳把任何 http/https 的 `window.open` / `target=_blank` 一律转给系统浏览器，并且拒绝在应用内开新窗。** 我的面板里有个「新窗口打开」按钮（`<a href={iframeUrl} target="_blank">`），点它就是「进谷歌网页」。

**正确做法**：**面板里永远不要出现 `target="_blank"` 或 `window.open`。** 所有内容都在面板内 iframe 里渲染。

### E19 · iframe 跨源 + `X-Frame-Options: DENY`

**现象**：iframe 挂上了（右上监控浮层显示「iframe 已挂载」），但主区域整片黑。

**真实原因**：房间的 `src/bridge.js:3676-3682` 有个 `SECURITY_HEADERS` 常量：

```js
'X-Frame-Options': 'DENY',
'Content-Security-Policy': "default-src 'self'; ...",
```

这个常量被 sendJson / 204 / 401 / 302 / 静态文件 / 控制台**共 6 处复用**，所以所有响应都带 `DENY`，浏览器拒绝在任何 iframe 里显示。

**正确做法**：**拆成两套头**——

```js
const SECURITY_HEADERS = { ...原来的..., 'X-Frame-Options': 'DENY', ... };   // API 面继续 DENY

const FRAMEABLE_HEADERS = {                                                  // 页面类用这套
  ...原样保留其余...,
  'Content-Security-Policy': "default-src 'self'; ...; frame-ancestors http://127.0.0.1:* http://localhost:* http://[::1]:*",
  // 注意：没有 X-Frame-Options
};
```

用在：房间静态 `.html`、攻略页、401 提示页、控制台页。API 面继续用 `SECURITY_HEADERS`。

**但注意**：这一条做完仍然白屏——因为还有 E20。**XFO 只是第一层，不是全部。**

### E20 · iframe 里的子请求不带 cookie，静态资源全 401

**现象**：XFO 解开后，页面 HTML 出来了，但 `app.js` / `garden.css` / 所有 `assets/*` 全 401。

**真实原因**：房间在 `/room/` 页面响应里设了 `Set-Cookie: dsh_room=...; Path=/room/; HttpOnly; SameSite=Strict`。**iframe 里跨站加载时，浏览器不发送 `SameSite=Strict` 的 cookie**，于是所有子资源请求都没有认证 → 401（返回的是 text/html 错误页，浏览器拒绝当脚本执行）。

**正确做法**（两条都要）：
1. 服务端：401 分支里如果是房间静态文件且 token 对得上，**直接按静态文件 200 返回**，不要走 401。
2. 前端：所有子资源 URL 带上 token（`?token=...`），让 token 成为静态文件的第二道凭据。

### E21 · 面板监视浮层显示「iframe 已摘除」但页面报 JSON 解析错误

**现象**：面板红字 `读不到房间配置：Failed to execute 'json' on 'Response': Unexpected end of JSON input`。

**真实原因**：配置接口返回了**空 body**。因为宿主对没有 owner cookie 的 fetch 返回 401 空响应。

**正确做法**：面板组件不要用裸 `fetch`，用宿主注入的 `ctx.fetch`：

```js
let dshFetch = null;
function setDshFetch(fn) { if (typeof fn === 'function') dshFetch = fn; }
function getDshFetch() {
  return dshFetch || (typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null);
}
// apply 里
if (ctx && typeof ctx.fetch === 'function') setDshFetch(ctx.fetch);
```

（顺带：官方 `@deepseek-ai/dsh-client-ui-deliverables/lib/client.js` 用的是**去掉开头斜杠的相对根路径** `fetch(PRESENT_HOST_ROUTE)`，不拼 `location.origin` 也不拼 `window.__DSH_BOOT__` 的 base。）

### E22 · 前缀重复拼成 `/room/room/`

**现象**：反代返回 404 `{"ok":false,"error":"房间文件不存在"}`。

**真实原因**：宿主可能已经把 `/fish-room` 剥掉了，我的 `mapUpstreamPath('/room/')` 又拼成 `/room/room/`（`src/bridge.js:4016` 那行回 404）。

**正确做法**：映射函数要**幂等**：
```js
function mapUpstreamPath(rest) {
  if (rest.startsWith('/room/')) return rest;   // 已经是完整路径，别再加前缀
  if (rest === '/api' || rest.startsWith('/api/')) return rest;
  if (rest === '/' || rest === '') return '/room/';
  return '/room' + rest;
}
```

---

## 四、性能阶段

### E23 · 卡顿的根因不是 CPU，是 GPU 填充率

**现象**：DSH 面板里房间只有 12.8 fps，p95 121ms。

**我当时以为**：JS 太慢 / 面板嵌套太多 / Electron 特有开销。

**实测结论**（全部本机数字）：

| 项 | 数值 | 结论 |
|---|---|---|
| WebGL renderer | `ANGLE (Intel, Intel(R) UHD Graphics …, D3D11)` | **核显，不是软件渲染，也不是独显** |
| draw call | **961 / 帧** | 极高 |
| 三角数 | 72,589 / 帧 | 不高 |
| GPU 纯渲染耗时（timer query） | p50 **0.903 ms** | GPU 单次提交不慢 |
| JS 每帧耗时 | p50 **0.10 ms** / p95 8.0 | **JS 不是瓶颈** |
| 帧时长 | p50 78.8 ms | 78.8ms 里 JS 只占 0.1ms |

**决定性实验**：只改 canvas 背存分辨率，不改一行代码：

| 分辨率 | 像素数 | fps |
|---|---|---|
| 1264×805 | 1,017,520 | 17.0 |
| 632×403 | 254,696 | 34.7 |
| 316×201 | 63,517 | 35.3（撞上限） |

**帧率随像素数近似反比 → fill-rate bound 铁证。** 瓶颈是「整屏像素填充 × 961 draw call × 21 个 PBR 材质 + MSAA」，不是 JS 也不是绘制调用数。

**正确做法**：
- 立竿见影：降 `pixelRatio`（1.0 → 0.75 就等于砍掉 44% 像素）
- 治本：合批（`world.js` 里 159 处 box/plane 构造、55 次 `new THREE.Mesh(`，**InstancedMesh / mergeGeometries / BufferGeometryUtils 零命中——完全没有合批**）
- 阴影：`shadowMap` 2048² PCFSoft 是第二大开销（关掉 +5.7 fps，但 draw call 不变 961，说明是片元采样成本）

### E24 · `Get-Process DeepSeek` 找不到进程，但通配符能找到

**现象**：`Get-Process DeepSeek` 报「找不到进程」，但 `Get-Process | Where-Object { $_.ProcessName -like 'Deep*' }` 能找到 9~11 个。

**正确做法**：用通配符版本，或者 `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` 逐个查。`Get-CimInstance ... | Where Name -eq 'DeepSeek.exe'` 也不可靠（大小写/过滤问题）。

### E25 · `ops_bash` 里 heredoc 写含反引号/`$()` 的内容会被 bash 先执行

**现象**：写 `交接.md` 时内容变成空字符串。

**真实原因**：heredoc 里没加引号（`<<EOF` 而不是 `<<'EOF'`）时，反引号和 `${...}` 会被 shell 展开执行。我的文档里有 `` `main.js:12024` `` 这种内容，被当成命令执行了，输出空串。

**正确做法**：
- heredoc 一律用 `<<'EOF'`（带引号）
- 或者干脆用 `ops_write_file` 工具写文件
- **长脚本先写成文件再跑，不要在命令行里内联**

### E26 · Python 写文件时 CRLF 会让字符串匹配失败

**现象**：用 Python 脚本改房间的 `app.js`，`s.replace(old, new)` 明明字符串是对的，但替换不生效。

**真实原因**：房间源码是 **CRLF** 换行。我的 `old` 字符串是 `\n`。

**正确做法**：
```python
s = s.replace('\r\n', '\n')   # 先统一
s = s.replace(old, new)
s = s.replace('\n', '\r\n')   # 再还原
```

### E27 · 房间对 `HEAD` 请求返回 401

**现象**：`curl -X HEAD http://127.0.0.1:13100/room/app.js` → 401，而 `curl` (GET) → 200。

**真实原因**：作者的静态文件分支只判 `req.method === 'GET'`。

**正确做法**：反代/探测脚本统一用 GET，或者接受 HEAD 会 401 这个事实。**不要根据 HEAD 的结果判断服务死活。**

---

## 五、显卡问题（为什么最后放弃了）

### E28 · 这台机器是「显示器硬接核显」的 Optimus 混合输出，没有 MUX

排查过程与硬证据：

| 检查 | 结果 | 含义 |
|---|---|---|
| `Win32_VideoController` | 只有 Intel 有 `VideoModeDescription = 2560 x 1440 … 165Hz`，NVIDIA 该字段为空 | 屏幕由核显驱动 |
| `nvidia-smi --query-gpu=display_active` | **Disabled** | 独显没接显示 |
| 显示适配器驱动实例 | `0001 = Intel UHD`、`0002~0007 = Microsoft Remote Display Adapter`，`0000 = NVIDIA`（`VgaCompatible = 0`） | 独显是渲染设备不是显示设备 |
| `WmiMonitorConnectionParams` | 屏幕 `CMN1540` 只有一个输出技术 ID（2147483648 = 未定义/内部） | 面板物理接在核显 |
| NVIDIA 控制面板「GPU 活动」页（老大截图） | 「**没有显示器连接到此 GPU 上**」，正在运行的应用只有 `qq.exe` | 同上 |

**机型**：Acer Nitro 5 **AN515-57**（主板 TGL `Scala_TLS`，Insyde BIOS V1.19，2022-10-28）。**这一代（2021 款）没有 MUX 开关**，独显直连是 AN515-58 之后才有。所以「进 BIOS 找独显直连」在这台机器上根本不存在这个选项。

### E29 · 两条「让 DSH 走独显」的路都试过，都失败了

**A1：注册表 `UserGpuPreferences`**

```powershell
New-ItemProperty -Path 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' `
  -Name 'D:\deepseek\DeepSeek.exe' -Value 'GpuPreference=2;'
```
→ 重启 DSH 两次，`WEBGL_debug_renderer_info` **仍然返回 Intel UHD**。

原因：`UserGpuPreferences` 是 **DWM 合成时的显示优先级提示**，在混合输出机型上不改变 ANGLE 建上下文时绑定哪块适配器。

**A3：启动参数**

```
--force_high_performance_gpu --use-angle=d3d11 --enable-gpu-rasterization
```
→ **参数根本没传进去**。证据：主进程（PID 13396）的完整命令行是
```
"D:\deepseek\DeepSeek.exe" --expose-internals ...\dsh-desktop-host\lib\index.js ...
```
`D:\deepseek\DeepSeek.exe` 是个 **Electron 外壳包装器**，它接收参数后按固定命令行 fork 真正的 desktop-host 进程，**参数在转手时被丢掉了**。GPU 进程（`--type=gpu-process`）命令行里没有任何我们的旗标。

**教训**：**Electron 外壳程序的 CLI 参数是不可控的。别在这上面花时间。**

### E30 · 唯一确定的路，都得等换机器

| 路线 | 可行性 |
|---|---|
| A2 外接屏插 HDMI | ✅ **唯一确定**（这型号 HDMI 直连独显，Type-C 走核显） |
| A4 装 NVIDIA 控制面板（Store 版） | ⚠️ 装了也要碰运气，屏幕挂核显时不保证能改 ANGLE 选卡 |
| A5 厂商控制中心 MUX 切换 | ❌ 重装系统后没装、这机型也没有 |
| B5 代码合批优化 | ✅ 不依赖硬件，核显预计 28~35 fps，外观零变化 |

**最终决定**：老大说「算了不搞了，换电脑再搞」。所以这份仓库把状态停在这里。

### E31 · NVIDIA 控制面板在这台机器上根本没装

全盘只找到：
- `C:\Windows\System32\nvcpl.dll`（5.9 MB，驱动自带的旧面板库）
- `C:\Program Files\NVIDIA Corporation\Installer2\installer.{...}\NvApp`（安装残留目录，只有 EULA 文档）
- 注册表 `HKLM\SOFTWARE\Classes\DesktopBackground\Shell` 下**没有** NVIDIA 控制面板项

**没有 `nvcplui.exe`。** 老大截图看到的那个「NVIDIA GPU 活动」页是驱动控制台的另一部分，不是控制面板。

---

## 六、工具与环境坑（跟房间无关但会咬人）

### E32 · `git` 的 `sslCAInfo` 指向不存在的文件

**现象**：
```
fatal: unable to access 'https://github.com/...': error adding trust anchors from file:
D:/deepseek_workplace/_dl/win-roots.pem
```

**真实原因**：`~/.gitconfig` 里配了 `http.sslCAInfo = D:/deepseek_workplace/_dl/win-roots.pem`，但这个文件**不存在**（目录被清过）。

**正确做法**：从 Windows 证书库导出：
```powershell
$certs = Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root
$sb = New-Object System.Text.StringBuilder
foreach ($c in $certs) {
  if ($c.NotAfter -lt (Get-Date)) { continue }
  [void]$sb.AppendLine('-----BEGIN CERTIFICATE-----')
  [void]$sb.AppendLine([Convert]::ToBase64String($c.RawData, 'InsertLineBreaks'))
  [void]$sb.AppendLine('-----END CERTIFICATE-----')
}
[System.IO.File]::WriteAllText('D:\deepseek_workplace\_dl\win-roots.pem', $sb.ToString())
```
导出 96 张证书后 `git ls-remote` 立刻通了。

### E33 · `curl` 传中文 JSON body 会超时

**现象**：向本地 webhook `POST {"text":"老大，你的任务跑完了..."}` → `exit 28` / `http=000`。

**真实原因**：curl 在多字节 body + Windows 环境下会出问题（与编码/长度计算有关）。

**正确做法**：body 用纯 ASCII（`{"text":"done"}`）+ `--data-binary`。或者用 Python urllib（但 python 也常报 `TimeoutError`，最稳的是 curl + ASCII）。

### E34 · PowerShell 里 `\` 在 bash → pwsh → 脚本三层转义会丢

**现象**：`Get-CimInstance Win32_Process -Filter \"Name='DeepSeek.exe'\"` 从 ops_bash 传进 pwsh，`\` 被吃掉，过滤条件变成空。

**正确做法**：**需要复杂 PowerShell 时，写独立的 `.ps1` 文件，然后 `powershell -NoProfile -ExecutionPolicy Bypass -File xxx.ps1`。** 不要在命令行里内联拼参数。

### E35 · `$()` 被 bash/node 双层转义

**现象**：在 node 里拼 PowerShell 单行命令读 `TotalProcessorTime`，报 `表达式或语句中包含意外的标记"$(“`。

**正确做法**：同上，独立 `.ps1` 文件。

### E36 · 本机 PATH 里没有 node / npm

**现象**：`which npm` 只找到 `/c/Program Files/Tuanjie/.../node`，是坏的。

**正确路径**：
```
node: D:\deepseek\resources\runtime\primary-runtime\dependencies\node\bin\node.exe  (v24.21.0)
pnpm: D:\deepseek\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs  (11.28.5)
```

### E37 · 绝不要在 DSH 运行时对 profile 目录跑 `pnpm install`

`~/.dsh/profiles/desktop` 的 `pnpm install` 会**先删整个 `node_modules` 再重装**，等于给运行中的 DSH 拔电源。而且重装要重新解析 github 依赖（本机 github 直连不稳），会在 `node_modules` 已空的状态下失败。

**正确做法**：装单个包用 `curl 下 tgz → tar 解 → cp -a 铺进 node_modules`；或者 DSH 完全退出后再 install。

### E38 · `ego_script` 里 `await` 超过 15 秒会超时

**现象**：`Runtime.evaluate timed out`。

**正确做法**：拆成两次 evaluate + service 侧 `setTimeout`；或者用 `page.waitForTimeout` 之类。不要在页面 evaluate 里 `await` 长定时。

### E39 · `ego_script` 里 `fetch` 不可用

`TypeError: fetch is not a function`。要拿数据就在页面里 `page.evaluate(() => fetch(...))`，或者用 `ego_http` 工具。

### E40 · DSH 重启后 ego 浏览器的 tab 全丢

`Error: no active tab to attach session`。必须先 `ego_space_open({name:'default'})` 再 `ego_navigate`。

### E41 · canvas `getImageData` 读全黑 ≠ 页面黑屏

`WebGLRenderer({ preserveDrawingBuffer: false })` 下，`getImageData` 在 rAF 之外调用必然读到全黑。**要判断是不是黑屏用截图，不要用 getImageData。**

---

## 七、如果重来一次，正确顺序是什么

```
1. 取件        → 镜像 gh-proxy.com 一次下完，别碰 codeload 直连
2. 读配置      → 先看 src/bridge.js 的默认值，别信 README 的端口
3. 装依赖      → pnpm install --config.confirmModulesPurge=false
4. 改三个配置  → consolePort=13100（或保留3100）、dsh.baseUrl=当前DSH端口、snowluma 6700/6701
5. 先直连验证  → 浏览器开 13100/room/ 确认房间本身正常，再谈挂面板
6. 面板 Host   → webServer.register({kind:'prefix'}) + connection.authorizeIndex
7. 面板 Client → apply 全程 try/catch + safeInject，改完先 vm 装载测试四环境
8. 反代细节    → node:http 不用 undici fetch；sec-fetch-mode 写 no-cors；前缀映射幂等
9. XFO/Cookie  → 拆两套头 + 静态资源 token 直通
10. 性能       → 先量 fill-rate（改背存分辨率一行代码），再决定合批还是降 pixelRatio
```

**如果只有一句话要记住**：**先让房间在浏览器里好好跑起来（第 5 步），再谈把它塞进 DSH。我们一开始就跳过了第 5 步，直接去搞面板，结果把「房间本身的问题」和「iframe 的问题」混在一起查了两天。**
