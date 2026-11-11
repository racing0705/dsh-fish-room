#!/usr/bin/env node
// 把文档里的本机绝对路径换成占位，用于公开仓库。
const fs = require('fs');
const files = process.argv.slice(2);
const RULES = [
  [/D:\\deepseek_workplace\\command-desk/g, '<WORKSPACE>\\command-desk'],
  [/D:\\deepseek_workplace\\plugin-dev/g, '<WORKSPACE>\\plugin-dev'],
  [/D:\\deepseek_workplace\\fish/g, '<WORKSPACE>\\fish'],
  [/D:\\deepseek_workplace\\_dl/g, '<WORKSPACE>\\_dl'],
  [/D:\\deepseek_workplace/g, '<WORKSPACE>'],
  [/D:\/deepseek_workplace/g, '<WORKSPACE>'],
  [/C:\\Users\\Administrator\\\.dsh/g, '%USERPROFILE%\\.dsh'],
  [/C:\\Users\\Administrator/g, '%USERPROFILE%'],
  [/C:\/Users\/Administrator/g, '%USERPROFILE%'],
  [/D:\\deepseek\\resources/g, '<DSH_INSTALL>\\resources'],
  [/D:\\deepseek\\DeepSeek\.exe/g, '<DSH_INSTALL>\\DeepSeek.exe'],
];
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  if (s !== before) { fs.writeFileSync(f, s, 'utf8'); console.log('sanitized', f); }
  else console.log('unchanged', f);
}
