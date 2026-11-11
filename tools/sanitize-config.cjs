#!/usr/bin/env node
// 去掉 config.json 里的本机私有信息（QQ 号 / 绝对路径 / 令牌），用于公开仓库。
// 用法: node sanitize-config.cjs <输入 config.json> <输出>
const fs = require('fs');
const src = process.argv[2] || 'config.json';
const dst = process.argv[3] || 'config.example.json';
const cfg = JSON.parse(fs.readFileSync(src, 'utf8'));

const NUMERIC_ID = /^(ownerQQ|qq|groupId|userId|adminQQ|xiaojiQQ|botQQ|selfQQ|masterQQ)$/i;
const arr = (v) => (Array.isArray(v) ? [] : v);

const walk = (o) => {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
    else if (Array.isArray(v)) o[k] = arr(v);
    else if (NUMERIC_ID.test(k) && typeof v === 'number') o[k] = 0;
    else if (typeof v === 'string') o[k] = v.replace(/[A-Za-z]:[\/][^\s"']*/g, '<ABS_PATH>');
  }
};
walk(cfg);
if ('consoleToken' in cfg) cfg.consoleToken = '';

fs.writeFileSync(dst, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('written', dst);
