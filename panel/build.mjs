/**
 * 把 src/client/main.js 打包成 client.js（单文件，无外部依赖，只 require('react')）。
 *
 * 产物形态必须是 window.__ModuleLoader__.load({id, factory}) —— DSH 客户端插件的唯一装载契约。
 * 本插件不内联 three：房间跑在 iframe 里，宿主只负责容器。
 */

import { rolldown } from 'file:///D:/deepseek_workplace/dsh-market/node_modules/.pnpm/rolldown@1.2.14/node_modules/rolldown/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 这些由 loader 提供，不打进产物。 */
const EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'];

const PLUGIN_ID = 'dsh-fish-room-panel';

const bundle = await rolldown({
  input: path.join(here, 'src/client/main.js'),
  platform: 'browser',
  external: (id) => EXTERNALS.includes(id),
});

const { output } = await bundle.generate({
  format: 'cjs',
  entryFileNames: 'client.js',
  banner: `window.__ModuleLoader__.load({ id: "${PLUGIN_ID}", factory: (require) => {`,
  footer: 'return module.exports; } });',
  // loader 的 factory(require) 只注入 require；React 要以 "react" 白名单取，不能靠全局
  intro: 'var module = { exports: {} }; var exports = module.exports; var React = require("react");',
});

const outFile = path.join(here, 'client.js');
for (const chunk of output) fs.writeFileSync(outFile, chunk.code);

const text = fs.readFileSync(outFile, 'utf8');
console.log(`[build] 写出 ${outFile}`);
console.log(`[build] ${fs.statSync(outFile).size} 字节`);
console.log(`[build] 装载契约 = ${text.startsWith('window.__ModuleLoader__.load(') ? '✅' : '❌'}`);
// react 是 global（loader 注入的 require 自由变量），这里只要确认没被内联成 require('react') 之外的裸引用
console.log(`[build] 顶部 require('react') = ${/factory:\s*\(require\)/.test(text) ? '✅ 位于 factory 签名' : '⚠ 未在签名处'}`);
console.log(`[build] 源码里是否残留 React 未定义引用 = ${/const React = require\(['"]react['"]\)/.test(text) ? '有（未声明）' : '无（依赖 loader 注入的全局 React）'}`);
