# 大肥鱼房间 · 挂进 DSH 面板（D20261111-fish-004）

> 一句话：房间已经做进 DSH 当面板了，代码全部改完、跨源链路实测打通、性能措施都落地并量过数。
> **唯一没做的一步是重启 DSH**——老大在用 GUI，我不擅自动它。重启后左侧/设置里会出现「大肥鱼的房间」。

- 派单：`<WORKSPACE>\command-desk\派单\D20261111-fish-004.json`（fish → plugin-dev，需回执）
- 老大原话：「好卡，这个能挂在DSH或桌面吗」→「先试着挂在DSH里，打开图标参考场景面板和记忆神经元」
- 人格接入：老大说「可以先不做」，本单未做（`src/preset-prompt.js` / `src/role-card.js` / `agent.cordis.yml` 一律没碰）

---

## 一、面板做出来没 —— 做出来了，但还差老大按一下重启

### 1. 新插件本体

`<WORKSPACE>\plugin-dev\plugins\dsh-fish-room-panel\`

| 文件 | 作用 |
| --- | --- |
| `package.json` | `dsh.bundle.patch` → `./cordis.patch.yml`；`dsh.client` → `{platform:'web', immediately:true}`；`engines.dsh >=0.1.7-rc.2` |
| `cordis.patch.yml` | `- insert: [{id: fish-room-panel, name: dsh-fish-room-panel}]`（profile 侧登记用 modify，不在这里 insert） |
| `index.js` | Host 半边，174 行，只读路由 |
| `src/client/main.js` | 面板组件，371 行 |
| `build.mjs` | rolldown 打包脚本（`intro` 必须含 `var React = require("react");`） |
| `client.js` | 打包产物 13068 B，`window.__ModuleLoader__.load({...})` 装载契约 ✅ |

Host 半边三条只读路由（`ctx.connection.fetch.register`）：
- `GET /api/fish-room/config` → `{roomUrl, iframeUrl, hasToken, roomRoot}`
- `GET /api/fish-room/probe` → `{ok, status, ms, bytes, title, hasCanvas, hasAppJs, frameDeny, csp}`
- `GET /api/fish-room/info` → 插件版本/房间根目录/token 长度

`readConsoleToken()` 读 `state/console-token` 并用 `/^[0-9a-fA-F]{16,128}$/` 校验，只回 `hasToken` 布尔，**不把 token 交给前端**（前端自己从房间页 URL 取）。
`probeRoom()` 用 `AbortSignal.timeout(4000)`，`--selftest` 实测：`{"ok":true,"status":200,"ms":39,"bytes":31078,"title":"小蓝鱼的家 · 大平层","hasCanvas":true,"hasAppJs":true,"frameDeny":false}`。

### 2. 挂载登记（已改，已备份）

- junction：`~/.dsh/profiles/desktop/node_modules/dsh-fish-room-panel` → `<WORKSPACE>\plugin-dev\plugins\dsh-fish-room-panel`（用 node 的 `fs.symlinkSync(target, link, 'junction')` 建的；`cmd //c mklink /J` 在 ops_bash 里两次都空转失败）
- `~/.dsh/profiles/desktop/package.json`：`dependencies` 26 → 27、`dsh.profile.bundles` 28 → 29
- `~/.dsh/profiles/desktop/cordis.patch.yml`：追加 `- id: fish-room-panel / name: dsh-fish-room-panel` + `config: {roomUrl: 'http://127.0.0.1:13100/room/', roomRoot: '<WORKSPACE>/plugin-dev/大肥鱼房间插件/_src/feiyu-room-template-main', probeTimeoutMs: 4000}`；顶层条目 22 → 23
- 备份：`<WORKSPACE>\plugin-dev\backups\fish-room-panel-20261111-154041\`（`cordis.patch.yml` 12956 B + `package.json` 2409 B）
- 配置 diff 核对：`added: ['fish-room-panel']`，`removed: []`，其余条目内容无变化

### 3. 面板长什么样

- 座位：`settings.section`（设置页「大肥鱼的房间」，id `fish-room`，order 122，紧挨记忆神经元的 121）+ `main`（key `dsh-fish-room-panel`）
- `const inject = ['slots'];` —— 这一行漏了就会「按钮正常、点开报 main panel not registered」（记忆神经元源码里专门为这个坑写了注释）
- 工具条：在线/离线点、标题+字节+耗时、`宿主 x fps`（≥50 绿 / ≥30 黄 / 其余红）、`堆 x MB`（`performance.memory.usedJSHeapSize`）、画质档切换、限帧切换、渲染开关、暂停、重载、新窗口打开
- 舞台：`<iframe src={iframeUrl} allow="autoplay; fullscreen" referrerPolicy="no-referrer">`，右上角 HUD 浮层
- 配色全用 `--dsw-alias-*` 主题令牌，不写死颜色 —— 跟记忆神经元、场景面板同款观感
- 图标：与场景面板/记忆神经元一致的 24×24 线性 SVG（`strokeWidth 1.7`、`strokeLinecap/Linejoin round`、`currentColor`）

### 4. 入口按钮（要不要加，等老大定）

场景面板和记忆神经元的图标都在 `conversation.header.leading` 那排按钮里，配置数组是 `<WORKSPACE>\plugin-dev\plugins\dsh-top-toolbar\` 的 `TOOLBAR_BUTTONS`。要加「房间」第三个按钮，只需往那个数组追加一条 `{bind:'scene-toggle', target:'dsh-fish-room-panel'}`（再点一次切回对话，正是 `scene-toggle` 的语义）。

**我没加**——这个插件老大定过「只保留两个按钮」，改他要的东西得他点头。现在房间只能从「设置 → 大肥鱼的房间」进去，主面板 key 已经注册好，按钮随时能补。

### 5. 重启才能看见

插件的 client 半边由 `dsh web` 在**启动时**扫描加载，profile 登记改了不重启不生效。所以：

**打开开始菜单 → 重开 DSH 桌面版**（或用 `restart-dsh-desktop` 技能）。重开后路径是：设置 → 大肥鱼的房间（或者以后补了按钮，点顶部图标也行）。

---

## 二、为了能挂进 iframe，房间侧改了什么

作者原版是**故意禁止被嵌**的，不改挂不进去。

### 改动 1：拆两套响应头（`src/bridge.js`）

原 `SECURITY_HEADERS` 带 `X-Frame-Options: DENY`，被 6 处复用（sendJson / 204 / 401 / 302 / 静态 / 控制台），浏览器一律拒绝渲染。

新增 `FRAMEABLE_HEADERS`：**去掉 `X-Frame-Options`**，CSP 末尾追加 `frame-ancestors http://127.0.0.1:* http://localhost:* http://[::1]:*`，其余不变。

只用在页面类响应上：①房间静态分支的 `.html` ②攻略页 `.html`/`.md` ③401 提示页 ④控制台首页。
**API 面继续 DENY**（`sendJson`/204 不换头）——只放开"能被嵌"，没放开"能被跨站调接口"。

### 改动 2：静态资源跨源 401（真因，值得记下来）

房间页设了 `Set-Cookie: dsh_room=...; SameSite=Strict`。iframe 里是跨站加载，浏览器**不发**这个 cookie → `app.js` / `garden.css` / `assets/*` 全部 401（返回的是 text/html 错误页，浏览器拒绝当脚本执行）→ 页面白屏。

修法：401 分支里加一条——`isRoomStatic && tokenMatches` 时按静态文件读出、200 返回。token 校验照旧，路径做了 `path.resolve` 前缀校验防穿越。

### 改动 3：房间前端三处 token 透传

- `public/room/index.html`：改成内联引导脚本，从 `location.search` 取 token 存 `window.__dshRoomToken`，再用它动态插入 `app.js?token=...`，`#gardenCss` 的 href 也补 token
- `public/room/app.js:20`：`const TOKEN = params.get('token') || window.__dshRoomToken || '';`；`:37` 新增 `asset(url)` 助手（给 wav / glb 加 token），用在音效与 `ensureModel3d`
- `public/room/actor.js:48`：新增 `withAssetToken(url)`，用在图层视频 `:134`、预取 `:223`、贴图 `:343`

备份：`backups\feiyu-room-20261111-141148\bridge.js.bak-before-xfo-20261111-154208`（812124 B）。

### 跨源矩阵实测（模拟 DSH 页 Origin `http://127.0.0.1:61901`）

| 场景 | 结果 |
| --- | --- |
| iframe 页面导航（cross-site） | **200 / 31078 B / XFO 头消失 / frame-ancestors 生效** |
| iframe 页面导航（same-origin） | 200 |
| 静态 `app.js` 跨站无 token | 401（411 B 错误页，预期） |
| 静态 `app.js` 跨站带 token | 200 + `text/javascript` |
| `/api/room/state` 跨站无 token | 401 |
| `/api/room/state` 跨站带 token | 200 / 1515 B |
| `/api/room/state` 同源无 token | 200 |
| `/api/home/state` 带 token | 200 / 13925 B |
| `/api/garden/state` 带 token | 200 / 10049 B |

真机渲染（ego Chromium，`/room/?token=...&q=low`）：25 个资源全部 200，`badCount=0`，canvas 1264×805，HUD 在，截图 `_shots\room-token-01.png`（627551 B）。
切 3D 实测 `da-feiyu.opt.glb` transferSize 7,021,724 / 42 ms，`localStorage['home-char-mode']='3d'`，截图 `_shots\room-token-3d.png`。

---

## 三、性能措施 + 实测数字

### 四条治理

| # | 措施 | 落点 |
| --- | --- | --- |
| ① | 24 fps 限帧 | `public/room/app.js` 主循环加 `FPS_CAP`（`?fps=N` 覆盖，`?fps=0` 不限） |
| ② | 面板不是当前页面 → iframe 直接不挂 | `main.js` 里 `shouldMount = iframeUrl && mounted && !paused && !hidden && isActive`（`usePanelInfo()` 的 `activePanelId`） |
| ③ | 标签页不可见 → 停渲染 | `app.js` 里 `document.addEventListener('visibilitychange')` + `scheduleFrame()` 在 `document.hidden` 时拒绝排下一帧 |
| ④ | 大资产延迟加载 | 房间默认 `charMode='webm'`（2D 立绘），6.7 MB 的 `da-feiyu.opt.glb` **只有点「3D」才动态 import** |

②③ 是双保险：面板内部摘 iframe 是"先手"，`document.hidden` 是"兜底"。devtools 实测两者都独立有效。

**踩过的坑**（写在这里免得下次再踩）：续命必须由 `scheduleFrame()` 统一负责，`requestAnimationFrame(frame)` 不能裸放在 `frame()` 顶部——否则暂停分支返回前又排了一帧，`__fishRoomFrameCalls` 疯长而渲染数为 0（rAF 空转照样唤醒 CPU）。限帧分支里也不能再排一次，会一帧排两次、帧率翻倍。

### 实测数字（本机 12 逻辑核，Chromium 窗口 2566×1299，DPR 1）

**限帧对照（最干净的一组，5 秒计数）**

| 配置 | 渲染次数 | 实际 fps |
| --- | --- | --- |
| `fps=24`（默认） | 110 / 5 s | **22.0** |
| `fps=0`（不限帧） | 149 / 5 s | **29.8** |

→ 24 限帧砍掉约 **26%** 的渲染次数（1 − 110/149）。

**画质档 × 限帧（同轮 6 秒，波动较大，另有标签在跑）**

| 配置 | fps | JS 堆 |
| --- | --- | --- |
| `q=low&fps=24` | 19.1 | 21.1 MB |
| `q=low&fps=0` | 16.8 | 20.3 MB |
| `q=balanced&fps=24` | 13.1 | 39.3 MB |
| `q=balanced&fps=0` | 14.0 | 29.1 MB |

→ `low` 档堆内存比 `balanced` 少约 **40%**（21.1 vs 39.3）。

**暂停 / 隐藏**

| 状态 | 6 秒内渲染次数 |
| --- | --- |
| `__fishRoomRenderPause(true)` 后 3 s | `ticks=0`（只剩最后 1 帧） |
| `document.hidden=true` 4 s | `renders=0` |
| 恢复后 3 s | 54 帧（≈18 fps） |

**房间 node 进程（PID 16436，`src/bridge.js`）**

| 状态 | CPU | WorkingSet |
| --- | --- | --- |
| 无浏览器在看 | 0 ~ 0.9% | 82.3 ~ 84.1 MB（峰值 95.6 MB） |
| 浏览器渲染中 | 0.3 ~ 0.5% | 83.2 MB |

→ **服务端几乎不耗 CPU**，它只做 1.2 s 一次的状态轮询，渲染全在浏览器里。「卡」的根源在浏览器 GPU/合成层，不在 node。

**浏览器侧 CPU：没拿到干净数字（如实写）**

- ego Chromium 合计 CPU 测得 **0%（单核）**，9 个进程 —— 因为窗口在后台/被 DSH 抢占时 Chromium 会节流 rAF，量不到前台渲染成本
- 系统 CPU 中位数：无页面 18% / 渲染中 17% / 暂停后 29% —— 受 DSH 自身 3 个 DeepSeek 进程（CPU 累计 3202 s / 2701 s / 1270 s）和 Steam++ 干扰，**不能作结论**
- 页面里的 `宿主 fps` / `堆 MB` 是可信的自观测数字（来自渲染循环与 `performance.memory`），建议老大重启后在面板工具条上看这两个值

测量脚本都在 `大肥鱼房间插件\`：`_probe-crossorigin.mjs`（跨源 9 例）、`_perf-sample.mjs`、`_perf-tristate.mjs`、`_perf-chrome.ps1`（必须独立 .ps1 跑，node 里拼 PowerShell 单行会被双层转义吃掉 `$()`）。

---

## 四、那 3 条 MCP 是什么

`scripts/setup-dsh.mjs desktop` 往 profile 的 `cordis.patch.yml` 塞了 3 条 stdio MCP（`command` 都是 `<DSH_INSTALL>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe`）：

| 名称 | 文件 | 工具数 | 干什么 |
| --- | --- | --- | --- |
| `mcp-snowluma` | `src/mcp-snowluma-safe.js`（1588 行） | 40 | QQ 安全子集：查状态/群/消息/发消息。**发送强制走 `allow.groups`/`allow.private` 白名单**，不在白名单的直接拒。`toolCallTimeoutMs: 725000` |
| `mcp-snowluma-host` | `src/mcp-host-server.js`（93 行） | 1 | 只有 `snowluma_status` 一个只读探活。**明确不含启停 SnowLuma**——作者注释写明 EULA §5.4「不得通过自动化脚本部署」 |
| `mcp-web-search-safe` | `src/mcp-web-search-safe.js`（92 行） | 2 | 只有 `web_search` / `web_fetch` 两个只读工具；禁内网地址、逐跳校验重定向、限字节流 |

**启用影响**：这三个是给「房间里的 AI 自己会聊 QQ / 会查网」用的。它们只读为主，`mcp-snowluma` 唯一能"写"的是发消息，而发消息受白名单硬限。装上之后每次会话启动会多起 3 个 node 子进程（stdio），常驻内存各几十 MB。

**不启用面板能不能工作**：能。房间页的聊天走 `/api/room/chat` → 房间进程 → DSH 的 `/api/...`，不经过 MCP。3 条 MCP 只影响"房间里的鱼能不能自己发 QQ / 联网查"，不影响房间渲染、状态、菜园、投屏。

**注意**：这三条是 `setup-dsh.mjs` 自动加的，和面板插件无关。要撤只删 profile `cordis.patch.yml` 里这三条即可（备份里有原样）。

---

## 五、要不要重启

**要。** 分两种：

- 只想看面板 → **重开 DSH 桌面版**（插件的 client 半边是启动时扫描加载的，profile 登记改了不重启不生效）
- 只是想看房间本身 → 不用重启，浏览器直接开 `http://127.0.0.1:13100/room/` 就能看

重启后如果面板没出现，按这个顺序查：
1. `ls -la ~/.dsh/profiles/desktop/node_modules/ | grep fish-room-panel` → 应该是 junction 且指向 plugin-dev
2. `grep -n fish-room-panel ~/.dsh/profiles/desktop/cordis.patch.yml` → 应该有一条
3. `grep -n fish-room-panel ~/.dsh/profiles/desktop/package.json` → dependencies + bundles 各一条
4. 面板里显示「房间没起来」→ 房间进程没跑，按第六节启停手册拉起来

---

## 六、怎么回滚

**只回滚面板（推荐）**：

```bash
BK=<WORKSPACE>/plugin-dev/backups/fish-room-panel-20261111-154041
cp "$BK/cordis.patch.yml" ~/.dsh/profiles/desktop/
cp "$BK/package.json"     ~/.dsh/profiles/desktop/
rm -f ~/.dsh/profiles/desktop/node_modules/dsh-fish-room-panel
# 插件源码留着不删也没事，profile 不登记就不加载
```

**连房间侧的 iframe 改动一起回滚**：

```bash
cp "<WORKSPACE>/plugin-dev/backups/feiyu-room-20261111-141148/bridge.js.bak-before-xfo-20261111-154208" \
   "<WORKSPACE>/plugin-dev/大肥鱼房间插件/_src/feiyu-room-template-main/src/bridge.js"
# public/room/{index.html,app.js,actor.js} 三处 token 透传与限帧改动，
# 原件在同目录 *.bak 或 git（仓库是 main 分支）可 checkout
```

**停房间进程 / 重启**：

```bash
cd /d/deepseek_workplace/plugin-dev/大肥鱼房间插件/_src/feiyu-room-template-main
PID=$(netstat -ano | grep ":13100 " | grep LISTENING | awk '{print $5}' | head -1); taskkill //PID $PID //F
node -e "const{spawn}=require('child_process');const fs=require('fs');const o=fs.openSync('logs/bridge.log','a'),e=fs.openSync('logs/bridge.err.log','a');const p=spawn('D:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe',['src/bridge.js'],{cwd:process.cwd(),detached:true,stdio:['ignore',o,e],windowsHide:true});p.unref();console.log(p.pid)"
```

正常启动的日志尾部（约 5 秒内）：
```
SnowLuma 已连接：ws://127.0.0.1:6700
DSH 已就绪（模式: reserved2）
桥接模式已确定为 reserved2
```

---

## 七、红线遵守情况

| 红线 | 状态 |
| --- | --- |
| 不破坏 `http://127.0.0.1:13100/room/` | ✅ 原 URL 仍 200（带不带 token 都行，loopback 免令牌），只是多了能被嵌的能力 |
| 不改 `<WORKSPACE>\fish\` | ✅ 一个字节没动 |
| 不重启 DSH | ⚠️ dsh-fish-004 阶段没重启；**dsh-fish-005 老大明确授权后已重启**（见第九节） |
| 人格接入先不做 | ✅ `preset-prompt.js` / `role-card.js` / `agent.cordis.yml` 未改 |

## 八、还没验的（老实说）

1. **面板在真 DSH 里长什么样**——没重启，没看到。ego 浏览器没有 DSH 的认证 cookie，截不到真 GUI。只能靠老大重启后肉眼看。
2. **浏览器侧前台 CPU**——ego 窗口被抢占后 Chromium 节流，量不到。建议老大在面板里看工具条的 `宿主 fps` / `堆 MB`。
3. **电视投屏、高清 58.9 MB 模型、菜园交互**——需要人手点击，本轮没验（前一轮 D20261111-fish-003 已验过菜园 8 畦与私聊真模型）。

---

# 九、顶部图标与重启验证（D20261111-fish-005）

老大原话（2026-11-11 16:13）：「在顶部工具条加第三个「房间」图标，加完后重启一下看看效果」——同时授权了「加第三个图标」和「重启 DSH」。

## 9.1 顶部图标加在哪

文件：`<WORKSPACE>\plugin-dev\plugins\dsh-top-toolbar\client.js`
（111934 B / 2304 行 → 112818 B / 2321 行；备份 `client.js.bak-20261111-fishroom`）

两处改动，都在原有结构里追加，前两个按钮一个字没动：

1. **`TOOLBAR_BUTTONS` 数组追加第三条**（`id:'memory-neuron'` 之后）：

```js
{ id: 'fish-room', icon: 'room', label: '房间', bind: 'scene-toggle', target: 'dsh-fish-room-panel', panelText: '' }
```

2. **`ICONS` 表新增 `room` 键**，24×24 viewBox，三条 path：

```
屋顶  M3.4 10.6 12 3.4 20.6 10.6
屋身  M5.6 9.6 V19.4 A1.2 1.2 0 0 0 6.8 20.6 H17.2 A1.2 1.2 0 0 0 18.4 19.4 V9.6
门框  M10.2 20.6 V15.2 A1.2 1.2 0 0 1 11.4 14 H12.6 A1.2 1.2 0 0 1 13.8 15.2 V20.6
```

样式全部沿用现有常量，没引入新值：`BTN = 30`（按钮边长 px）、`BTN_ICON = 16`（图标边长）、`BTN_GAP = 4`、`strokeWidth 1.7`、`strokeLinecap/Linejoin = round`、`fill = none`、`stroke = currentColor`、配色走 `MIST` 令牌表（idle / hover / sel 三态与另两个按钮完全一致）。

**交互零改动**：`bind:'scene-toggle'` 的现成分支（`client.js:1274-1277`）就是 `gotoScene(activeMainPanel === button.target ? '' : button.target)`——点一下进面板，再点切回对话；激活态跟 `activeMainPanel` 走（`client.js:1333-1334`），从别处切走会自动失活。`target:'dsh-fish-room-panel'` 与插件 `src/client/main.js` 里的 `MAIN_PANEL_ID` 一字不差。

装载校验（沙箱 eval + 假 require）：`id='dsh-top-toolbar'`、`inject=['slots']`、`apply` 是 function、三个按钮都在。

## 9.2 重启前后证据

用 skill `restart-dsh-desktop` 的 WMI 派生路径（绕开 Electron Job Object 连带杀进程）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass ^
  -File "%USERPROFILE%\.dsh\skills\restart-dsh-desktop\scripts\run-later.ps1" ^
  -Delay 45 -KeepCookies -Port 61901
```

引导进程 PID 16844，日志 `%USERPROFILE%\.dsh\skills\restart-dsh-desktop\logs\restart-20261111-161547.log`。用 `-KeepCookies` 是因为 `dsh-auth-*` 老 cookie 还没多到爆 431，先不动现有登录态。

| | 重启前 | 重启后 |
| --- | --- | --- |
| DSH 主进程 | PID 4404 | 16:16:36 新主进程起来（老进程及全部 DeepSeek 进程退出） |
| GUI 端口 | 61901 | **57599**（`--port 0` 随机分配，会话 URL 变成 `http://127.0.0.1:57599`） |
| GUI 探活 | — | `curl -o /dev/null -w %{http_code} http://127.0.0.1:57599/` → **401**（服务活着；没有 auth cookie 时就是这个） |
| 监听端口 | 6700 / 8120 / 8121 / 8798 / 61901 / … | 6700 / 8120 / 8121 / 8798 / **57599** / 57664 |
| 房间进程 | PID 6632（13100） | **被一起带走**（13100 无监听）→ 重新拉起 **PID 14712** |
| 房间 `config.json` 的 `dsh.baseUrl` | `http://127.0.0.1:61901` | `http://127.0.0.1:57599` |

日志尾部证据（`restart-20261111-161547.log`）：`全部退出（第 1 轮）` / `cookie 库已解锁` / `已启动 <DSH_INSTALL>\DeepSeek.exe`。

### 踩到的坑（下次必须记住）

**DSH 每次重启 GUI 端口都会变**（`--port 0`），于是：

1. 房间 `config.json` 的 `dsh.baseUrl` 必须同步改成新端口，否则房间日志刷 `DSH 事件流已结束（本次收到 0 帧）`；
2. 房间进程是 detached spawn 拉起的，DSH 主进程退出会把它带走，**必须重新拉起**。

改法：

```bash
cd /d/deepseek_workplace/plugin-dev/大肥鱼房间插件/_src/feiyu-room-template-main
python -X utf8 -c "import json;d=json.load(open('config.json',encoding='utf-8'));d['dsh']['baseUrl']='http://127.0.0.1:57599';json.dump(d,open('config.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)"
# 再按第六节的启停手册拉起房间
```

重启后房间日志尾部（全绿）：

```
16:18:00 [bridge] 本地控制台已启动：http://127.0.0.1:13100
16:18:00 [bridge] SnowLuma 已连接：ws://127.0.0.1:6700
16:18:00 [bridge] DSH 已就绪（模式: reserved2）
16:18:00 [bridge] 桥接模式已确定为 reserved2，恢复有限睡眠定时器
```

## 9.3 面板与房间验证

**Host 自检**（`node index.js --selftest`，cwd `plugins/dsh-fish-room-panel`）：

```
roomUrl   http://127.0.0.1:13100/room/
tokenLength 48
probe     ok:true  status:200  ms:64  bytes:32403
          title: 小蓝鱼的家 · 大平层   hasCanvas:true  hasAppJs:true
          frameDeny:false
          csp: …; frame-ancestors http://127.0.0.1:* http://localhost:* http://[::1]:*
```

**房间渲染**（ego 浏览器，`/room/?token=…&q=balanced&fps=24`）：

| 项 | 值 |
| --- | --- |
| title | 小蓝鱼的家 · 大平层 |
| canvas | 1264×805 |
| `#hud` | 在 |
| 资源 | **31 个，失败 0**（无 401/404） |
| `__fishRoomPerf()` | `{fpsCap:24, paused:false, hidden:false}` |
| 渲染 | **5 秒 118 帧 = 23.6 fps**（限帧 24 生效） |
| 暂停 | `__fishRoomRenderPause(true)` 后 4 秒 **0 帧**，`perf.paused=true`；恢复后 3 秒 71 帧 |

与 D20261111-fish-004 那一轮的 22.0 fps 同档，**没有性能回退**。

截图：`_shots\room-after-restart.png`（675065 B / 1264×805）——3D 大平层完整渲染：客厅/卧室/餐厅/厨房/阳台都在，鱼在卧室床上钻被窝，左侧「她的房间」状态卡（精力/饱/渴/不适 四条进度 + 摸摸头/喂小鱼干/倒杯水/留句话/哄她睡/开灯/陪她玩/叫醒 八个按钮，亲密度 10·眼熟），右侧「小蓝鱼动作」12 个动作按钮，顶部一排开关，底部 偷瞄/走进去/她的视角/和她聊聊。**不是白屏，无报错**。

## 9.4 本单诚实交代

- 面板在**真 DSH GUI 里**长什么样，我仍然没亲眼看到——ego 浏览器没有 DSH 的认证 cookie（打开 `http://127.0.0.1:57599` 只会得到 `<pre>dsh web authentication required; reopen the URL printed by dsh web.</pre>`），截不到真 GUI。老大需要在**新端口 57599 的窗口**里点顶部第三个图标确认。
- 顶部第三个图标是否真要摆在这个位置、要不要换图标意象，等老大看过再调。
- 三条 MCP（`mcp-snowluma` / `mcp-snowluma-host` / `mcp-web-search-safe`）重启后已生效，留还是撤仍待老大定。

## 9.5 回滚（本单新增的两处）

```bash
# 撤顶部图标
cp "<WORKSPACE>/plugin-dev/plugins/dsh-top-toolbar/client.js.bak-20261111-fishroom" \
   "<WORKSPACE>/plugin-dev/plugins/dsh-top-toolbar/client.js"
```

房间侧改动（bridge.js / index.html / app.js / actor.js）与面板插件的回滚见第六节。

---

# 十、同源化改造（白屏根治）· D20261111-fish-006

老大 19:04 的截图：面板整片深色，中央红字
`读不到房间配置：Failed to execute 'json' on 'Response': Unexpected end of JSON input`，
右上浮层 `宿主 fps 165 / 堆内存 79.6 MB / 画质 balanced / 限帧 24 fps / iframe 已摘除`。
这一轮把「为什么在浏览器里好好的、进 DSH 就白」彻底查清并改掉了。

## 10.1 白屏真正的三层原因（按发现顺序）

| # | 原因 | 证据 | 改法 |
|---|---|---|---|
| ① | **Electron 把 `target=_blank` 转给系统浏览器** | `<DSH_INSTALL>\resources\app\lib\main.js:12024` → `setWindowOpenHandler(({url}) => { if (['http:','https:'].includes(new URL(url).protocol)) shell.openExternal(url); return {action:'deny'} })` | 删掉面板里「新窗口打开」入口（`src/client/main.js`），现在没有任何 fallback 打开外部浏览器的分支 |
| ② | **宿主 Fetch 路由只认精确路径，不认 glob** | `dsh-client-connection/lib/index.js:823-836` `createSharedFetchHandler` 里是 `this.fetchRoutes.get(url.pathname)` —— 整串精确匹配；`:848` 注册时也只按 `route.path` 存。我之前写的 `/api/fish-room/web/**` 能注册成功但**永远命中不到**，请求落到宿主默认 `401 unauthorized`（`admit()` 里 `browserAuth.isAuthenticated` 不过） | 反代全部改成**精确路由 + 路径入参**：`/api/frp/index?p=/room/app.js`、`/api/frp/api?p=/api/home/state` |
| ③ | **面板组件不能直接 `window.fetch` 打宿主 API** | 宿主 `createSharedFetchHandler` 要求 `peer.principal.kind === 'owner'`，直接 `fetch('/api/xxx')` 拿到的是空 body → `res.json()` 抛的就是那句 `Unexpected end of JSON input` | 走 `props/ctx` 注入的 fetch（`ctx.fetch` / `ctx.dshFetch` 能力探测），并把 URL 换成官方 UI 插件的写法：**去掉开头斜杠的相对根形式**（`dsh-client-ui-deliverables/lib/client.js` 里 `PRESENT_HOST_ROUTE = PRESENT_HOST_PATH.slice(1)` 就是这招） |

三层里 ③ 是「红字」的直接原因，② 是「就算不红字也拿不到内容」的原因，① 是老大说的「点开要进到谷歌网页」。

## 10.2 最终架构（同源单入口反代）

```
DSH 页面 (http://127.0.0.1:<port>)
  └─ iframe src="/api/frp/index?p=%2Froom%2F&t=8aeafb…"     ← 同源，无跨源闸
       ├─ 页面内相对 import → /api/frp/world.js（无 p，按 /api/frp/<rest> → /room/<rest> 还原）
       ├─ 显式资源      → /api/frp/index?p=%2Froom%2Fapp.js&t=…
       └─ 房间 API      → /api/frp/api?p=%2Fapi%2Fhome%2Fstate&t=…
            └─ Host 半边 proxyIndex() 转发到 http://127.0.0.1:13100
                 （改写 origin/referer/sec-fetch-* 为 same-origin，剥 cookie）
```

- host 只注册 **5 条精确路由**：`GET /api/frp/config`、`GET /api/frp/probe`、`GET /api/frp/info`、`/api/frp/index`（7 个方法）、`/api/frp/api`（7 个方法）。
- 前缀从 `/api/fish-room` 收短成 `/api/frp`：一是让路径段满足宿主的 `ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/`，二是短、少打字。
- `mapUpstreamPath(rest)` 的形状由作者 `app.js:23` 的 `BASE_PATH` 决定：页面必须在 `/room/` 下、API 必须在根下，`BASE_PATH='/room'` 才能同时拼对两者。

## 10.3 这一轮改动的文件

| 文件 | 改了什么 |
|---|---|
| `plugins/dsh-fish-room-panel/index.js` | 路由 `/api/fish-room/*` → `/api/frp/*`（27 处）；`proxyIndex` 无 p 分支还原 `/room/<rest>`；`--selftest` 输出 `webBase:/api/frp/index?p=%2Froom%2F` `apiBase:/api/frp/api` |
| `plugins/dsh-fish-room-panel/src/client/main.js` | 删「新窗口打开」；新增 `dhUrl(path)`（相对根形式）+ `setDshFetch/getDshFetch`（`ctx.fetch`、`ctx.dshFetch` 双探测，兜底 `window.fetch.bind`）；config/probe 两个请求全部改走它 |
| `plugins/dsh-fish-room-panel/client.js` | rolldown 重打包 15840 B，装载契约 ✅ |
| `.../public/room/index.html` | 页内注入脚本里 4 处 `/api/fish-room` → `/api/frp`（`__dshRoomAsset` / `__dshRoomApi` 的前缀） |
| `.../config.json` | `dsh.baseUrl` 跟着 DSH 端口走：61901 → 57599 → 64599 → 54402 → 55475 → **55692** |

## 10.4 验收（本地同源模拟宿主 `_probe-insert.mjs`，端口 18777）

- `GET /api/frp/config` → 200，`mode:"same-origin-proxy"`，`iframeUrl:"/api/frp/index?p=%2Froom%2F&t=…"`
- `GET /api/frp/index?p=%2Froom%2F` → 200 / 34752 B
- `GET /api/frp/index?p=%2Froom%2Fapp.js` → 200 / 98526 B
- `GET /api/frp/api?p=%2Fapi%2Fhome%2Fstate` → 200 / 12828 B
- `GET /api/frp/world.js`（无 p，模拟相对 import）→ 200 / 85872 B
- 浏览器里真跑：`__fishRoomRenderTick=118` 起步、canvas **1264×805**、23 个资源 200、**只有 `/favicon.ico` 401**（宿主拦截，与房间无关）、`__homeErrors` 空、3 秒 55 帧 ≈ **18.3 fps**（限帧 24，同机波动）
- 截图：`_shots/same-origin-frp.png`（631262 B / 1264×805）—— 3D 大平层完整渲染、鱼在床上钻被窝、「她的房间」状态卡 + 八个按钮、右侧动作栏、底部四个视角按钮

## 10.5 房间里仍然存在的两个「作者原样」行为（不是 bug）

- **控制台端口写死在 config**：作者文档写 13100，代码默认 3100，已按文档对齐成 13100。
- **每次 DSH 重启都要改 `dsh.baseUrl`**：因为 DSH 桌面版用 `--port 0` 随机端口。这是本机常态，不是房间的问题。启动后判「通没通」只看日志三行：`本地控制台已启动` / `SnowLuma 已连接` / `DSH 已就绪（模式: reserved2）`；出现 `DSH 事件流已结束（本次收到 0 帧）` 就是 baseUrl 填错了。

## 10.6 回滚

```bash
cd /d/deepseek_workplace/plugin-dev/plugins/dsh-fish-room-panel
cp index.js.bak-before-sameorigin index.js
cp src/client/main.js.bak-before-sameorigin src/client/main.js
node build.mjs
# 房间页面：cp _dl/pristine/index.html ../大肥鱼房间插件/_src/feiyu-room-template-main/public/room/index.html
```

---

# 十一、v3 前缀路由（把「DSH 打不开」和「点房间没动作」一起解决）· D20261111-fish-007

> 一句话：**不再走 `/api` 的 fetch 路由**，改用宿主自己的 `webServer.register({kind:'prefix'})` —— 这是官方 `dsh-experimental-inspector` 挂 devtools 页面的那条路。

## 11.1 上一版（v2）为什么让整台 DSH 起不来

老大 2026-11-11 19:18 的故障记录 `%USERPROFILE%\WorkBuddy\2026-10-31-19-35-43\DSH-启动故障修复记录-20261111.md`（356 行）＋两份崩溃日志：

| 证据 | 内容 |
| --- | --- |
| `crash-2026-11-11T11-10-31-325Z-web-boot.log` | `dsh-fish-room-panel: failed` |
| `crash-2026-11-11T11-14-26-474Z-web-boot.log` | `dsh-fish-room-panel: loading` |
| 栈顶 | `at file:///D:/deepseek/resources/app/lib/main.js:12496:15` |
| 前端 `dsh-web-frontend/dist/assets/index-BXV-oxvX.js` | 遍历 `loader.entries()`，只要有一个不是 `active` 就 `throw new Error('web boot: N entry did not activate')` —— **一票否决** |

根因三条，全部有代码行：

1. **client 半边 `apply` 无防护**：v2 里直接 `ctx.slots.inject(...)`，任何一抛 → entry 停在 `failed`/`loading` → 一票否决 → 主窗口不出。
2. **前后端前缀不一致**：client 打 `/api/fish-room/*`，host 注册的是 `/api/frp/*` → 必然 404（老大文档 7.1 也写了这条）。
3. **`connection.fetch.register` 的路由根本用不了**（换前缀也救不回来）：
   - `dsh-client-connection/lib/index.js:823-836` `createSharedFetchHandler` 是 `this.fetchRoutes.get(url.pathname)` —— **精确匹配**，glob 注册得进去、永远命中不到；
   - `:743-749` `admit()` 里 `browserAuth.isAuthenticated(request, secure)` 失败即 401 —— iframe 里的 `<script>/<img>` 子请求不带 cookie，必然 401；
   - `:926-930` `endpointFromPath()` 只允许 `/api/` 后**单段**端点（`ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/`），多段路径注册了也匹配不上。

## 11.2 v3 的做法（照抄官方 inspector）

官方 `@deepseek-ai/dsh-experimental-inspector/lib/index.js:2426-2448` 要在页面里挂 devtools 静态站，用的是：

```js
disposers.push(ctx.webServer.register({ kind:'prefix', path: DEVTOOLS_PATH, handler:(req,res)=>{
  if (req.method!=='GET' && req.method!=='HEAD') { res.writeHead(405,{allow:'GET, HEAD'}).end(); return; }
  if (!ctx.connection.authorizeIndex(req, res)) return;   // ← 自己跑会话 cookie 校验
  ... serveStatic ...
}}));
```

`DEVTOOLS_PATH = "/inspector/devtools"`。这条路**不受 /api 单段端点限制、不受 fetch 路由 owner 约束**。

我们的对应实现：

| 入口 | 处理 |
| --- | --- |
| `GET /fish-room/room/*` | `webServer.register({kind:'prefix', path:'/fish-room'})` → `authorizeIndex` → 反代到 `http://127.0.0.1:13100` |
| `GET /fish-room/api/*` | 同一前缀，`mapUpstreamPath` 直通到房间的 `/api/*` |
| `GET /api/frp/config \| /probe \| /info` | 保留的 3 条精确 fetch 路由，只给面板组件拉配置用（单段，合规） |

iframe 的 src 是**同源相对路径** `/fish-room/room/?q=…&fps=…`，不出 DSH、不跨站、不需要 token。

## 11.3 撞到的三个坑（都修了，别再犯）

**坑 1：宿主可能已经把前缀剥掉了，`mapUpstreamPath` 又拼一层。**

真实现：`rest = '/room/'` 时 `mapUpstreamPath('/room/')` 拼成 `/room/room/` → 房间回 404 `{ok:false,error:"房间文件不存在"}`。
修法：`mapUpstreamPath` 里先判「已经在 `/room/` 下就别再拼」。

**坑 2：undici 的 `fetch` 会无视你删掉的 `sec-fetch-*` 头，强制补 `sec-fetch-mode: cors`。**

这会让房间的 `roomOpen` 判定失败。修法：转发改用 `node:http` 原生 `request()`，自己写死 `sec-fetch-site: same-origin` / `sec-fetch-mode: no-cors` / `sec-fetch-dest: document`。

**坑 3：前端不能硬编码反代前缀。**

第三版把 `WEB_PREFIX` 写死成 `/fish-room/room/`，结果直连 `http://127.0.0.1:13100/room/` 时子资源被拼成 `/fish-room/room/app.js` → 404 → 白屏。
修法：`index.html` 的引导脚本改成**按 `location.pathname` 自适应**：

```js
var __i = location.pathname.indexOf('/room/');
var WEB_PREFIX = __i >= 0 ? location.pathname.slice(0, __i + 6) : '/room/';
var API_PREFIX = __i >= 0 ? location.pathname.slice(0, __i) : '';
```

直连 → `/room/` + `/api/`；走 DSH → `/fish-room/room/` + `/fish-room/api/`。两种入口同一份代码。

## 11.4 验收（本地 mock 宿主 `_probe-final.mjs`，端口 18909 模拟宿主行为）

```
page        200      34798B text/html; charset=utf-8
appjs       200      98526B text/javascript; charset=utf-8
three       200    1272972B text/javascript; charset=utf-8
glb         200    7021424B model/gltf-binary
homestate   200      12836B application/json; charset=utf-8
roomstate   200       1934B application/json; charset=utf-8
garden      200      11253B application/json; charset=utf-8
bad= 0
```

浏览器侧（ego）：

| 入口 | tick | canvas | 资源失败 | 帧率 |
| --- | --- | --- | --- | --- |
| 直连 `127.0.0.1:13100/room/` | 128 | 1264×805 | 0 | 24 限帧正常 |
| 反代 `127.0.0.1:18910/fish-room/room/` | 235 | 1264×805 | 只有 `/favicon.ico` | 18.3 fps（限帧 24）|

暂停/恢复：`__fishRoomRenderPause(true)` 后 tick 不再增长；恢复后 3 秒 55 帧 = 18.3 fps。

截图：`_shots/v3-fish-room-prefix.png`（1264×805，3D 大平层完整渲染、鱼在床上、状态卡/动作栏/底部条全在）、`_shots/v3-prefix-room.png`。

## 11.5 改动的文件

| 文件 | 改了什么 |
| --- | --- |
| `plugins/dsh-fish-room-panel/index.js` | 整文件重写成 v3：`inject=['connection']`、`optional=['webServer']`、`WEB_PREFIX='/fish-room'`、`forwardNative` 用 `node:http`、`mapUpstreamPath` 去重、`apply` 整段 try/catch |
| `plugins/dsh-fish-room-panel/src/client/main.js` | `apply` 加 `safeInject` + try/catch；`dhUrl` 走 `/api/frp`；删掉 `target:'_blank'` |
| `plugins/dsh-fish-room-panel/client.js` | 重打包 16932 B，装载契约 ✅ |
| `.../public/room/index.html` | 引导脚本改成按 `location.pathname` 自适应前缀 |
| `大肥鱼房间插件/_room-service.cjs`（新增） | `node _room-service.cjs start\|stop\|status` 管 13100 |

## 11.6 回滚

```bash
cp ~/.dsh/profiles/desktop/cordis.patch.yml.bak-fishroom-enable-20261111-193049 ~/.dsh/profiles/desktop/cordis.patch.yml
# 或者只在 plugin-dev 侧停用：
#   在 cordis.patch.yml 的 - id: fish-room-panel 下加 disabled: true
node <WORKSPACE>/plugin-dev/大肥鱼房间插件/_room-service.cjs stop
```

## 11.7 老实说：还没验的那一步

**面板在真 DSH 窗口里长什么样，我没亲眼看到。** ego 浏览器手里没有 DSH 的认证 cookie（打开 `http://127.0.0.1:58860/` 只得 `<pre>dsh web authentication required; reopen the URL printed by dsh web.</pre>`），所以只能做到：mock 宿主等价验证 + 前缀路由 7/7 全 200 + 沙箱四环境 apply 不抛。

这一次的验收闭环必须是老大亲手：在新 URL 里点顶部第三个「房间」图标，主区域应该就地出房间。
