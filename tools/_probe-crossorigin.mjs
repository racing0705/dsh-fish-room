/**
 * 跨源 iframe 可行性实测：模拟 DSH 页面（http://127.0.0.1:61901）里嵌房间 iframe 时，
 * 浏览器会发的每一类请求，逐条打印状态码与关键响应头。
 */
const TOKEN = process.env.ROOM_TOKEN || '';
const BASE = 'http://127.0.0.1:13100';
const DSH = 'http://127.0.0.1:61901';

const cases = [
  ['页面导航（iframe src，跨站）', `${BASE}/room/`, { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe', origin: DSH }],
  ['页面导航（iframe src，带 token）', `${BASE}/room/?token=${TOKEN}`, { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe', origin: DSH }],
  ['页面导航（same-origin，本窗口）', `${BASE}/room/`, { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'document' }],
  ['静态 app.js（跨站）', `${BASE}/room/app.js`, { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script', origin: DSH }],
  ['API state（跨站，无 token）', `${BASE}/api/room/state`, { 'sec-fetch-site': 'cross-site', origin: DSH }],
  ['API state（跨站，带 token）', `${BASE}/api/room/state?token=${TOKEN}`, { 'sec-fetch-site': 'cross-site', origin: DSH }],
  ['API state（同源，无 token）', `${BASE}/api/room/state`, { 'sec-fetch-site': 'same-origin', origin: BASE }],
  ['API home（跨站，带 token）', `${BASE}/api/home/state?token=${TOKEN}`, { 'sec-fetch-site': 'cross-site', origin: DSH }],
  ['API garden（跨站，带 token）', `${BASE}/api/garden/state?token=${TOKEN}`, { 'sec-fetch-site': 'cross-site', origin: DSH }],
];

for (const [name, url, headers] of cases) {
  const started = Date.now();
  let line;
  try {
    const res = await fetch(url, { headers });
    const body = await res.text();
    const xfo = res.headers.get('x-frame-options') || '-';
    const fa = /frame-ancestors[^;]*/.exec(res.headers.get('content-security-policy') || '')?.[0] || '-';
    line = `http=${res.status} ${Date.now() - started}ms ${body.length}B xfo=${xfo} fa=${fa.slice(0, 60)}`;
  } catch (error) {
    line = `ERR ${error.message}`;
  }
  console.log(`${name.padEnd(30, ' ')} ${line}`);
}
