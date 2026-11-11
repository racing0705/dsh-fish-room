/**
 * 真机验证：用 ego 浏览器打开带 token 的 /room/，检查渲染、资源与 API 是否全部活着。
 * 这是「跨源 iframe」的近亲场景（新窗口 + 带 token），能验出 401 链。
 */
const TOKEN = process.env.ROOM_TOKEN || '';
const URL_ = `http://127.0.0.1:13100/room/?token=${TOKEN}&q=low`;

await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));

const info = await page.evaluate(() => {
  const perf = performance.getEntriesByType('resource');
  const bad = [];
  const ok = [];
  for (const e of perf) {
    const n = e.name.split('/').pop().split('?')[0];
    if (e.transferSize === 0 && e.decodedBodySize === 0 && e.duration > 0) bad.push({ n, d: Math.round(e.duration) });
    else ok.push(n);
  }
  const c = document.querySelector('canvas#scene');
  let colors = 0;
  try {
    const t = document.createElement('canvas');
    t.width = 60; t.height = 40;
    t.getContext('2d').drawImage(c, 0, 0, 60, 40);
    const d = t.getContext('2d').getImageData(0, 0, 60, 40).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    colors = set.size;
  } catch (e) { colors = -1; }
  return {
    title: document.title,
    canvas: c ? `${c.width}x${c.height}` : null,
    colors,
    badCount: bad.length,
    bad: bad.slice(0, 8),
    okCount: ok.length,
    token: Boolean(window.__dshRoomToken),
    hud: !!document.getElementById('hud'),
  };
});

console.log('@@DSH_RESULT@@' + JSON.stringify(info));
