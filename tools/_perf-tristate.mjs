/**
 * 三态对照实测：房间渲染中 / 面板摘掉（iframe 移除）/ 房间进程停掉。
 * 每态采 3 次系统 CPU，取中位数；同时记录房间进程 CPU。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (cmd) => execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();

function bridgePid() {
  const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  const line = out.split(/\r?\n/).find((l) => /:13100\s+.*LISTENING/.test(l));
  return line ? Number(line.trim().split(/\s+/).pop()) : 0;
}

function sysCpu() {
  const v = ps(`(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \\"Name='_Total'\\").PercentProcessorTime`);
  return Number(v);
}

function bridgeCpu(pid) {
  if (!pid) return null;
  try {
    const a = Number(ps(`(Get-Process -Id ${pid}).TotalProcessorTime.TotalSeconds`));
    const t0 = Date.now();
    execSync('powershell -NoProfile -Command "Start-Sleep -Seconds 3"');
    const b = Number(ps(`(Get-Process -Id ${pid}).TotalProcessorTime.TotalSeconds`));
    return Math.round((b - a) / ((Date.now() - t0) / 1000) * 1000) / 10;
  } catch { return null; }
}

const pid = bridgePid();
const samples = [];
for (let i = 0; i < 3; i++) { samples.push(sysCpu()); await sleep(700); }
samples.sort((a, b) => a - b);
const out = {
  pid,
  systemCpu: samples,
  systemCpuMedian: samples[1],
  bridgeCpu: bridgeCpu(pid),
  bridgeWS_MB: pid ? Math.round(Number(ps(`(Get-Process -Id ${pid}).WorkingSet64`)) / 1048576 * 10) / 10 : null,
  at: new Date().toISOString(),
};
console.log(JSON.stringify(out));
fs.appendFileSync('D:\\deepseek_workplace\\plugin-dev\\大肥鱼房间插件\\_perf-tristate.jsonl', JSON.stringify(out) + '\n');
