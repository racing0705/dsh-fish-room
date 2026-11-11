/**
 * 房间进程 + 浏览器渲染的成本实测。
 * 采样三态：①房间在跑且有人在看 ②房间在跑但面板摘掉（无人看）③房间进程停掉
 * 只读：Get-Counter / Get-Process，不改任何东西。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (cmd) => execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();

function bridgePid() {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const line = out.split(/\r?\n/).find((l) => /:13100\s+.*LISTENING/.test(l));
    return line ? Number(line.trim().split(/\s+/).pop()) : 0;
  } catch { return 0; }
}

function sample(pid, seconds = 5) {
  if (!pid) return { alive: false };
  try {
    const a = ps(`(Get-Process -Id ${pid}).TotalProcessorTime.TotalSeconds`);
    const m0 = ps(`(Get-Process -Id ${pid}).WorkingSet64`);
    const t0 = Date.now();
    execSync('powershell -NoProfile -Command "Start-Sleep -Seconds ' + seconds + '"');
    const b = ps(`(Get-Process -Id ${pid}).TotalProcessorTime.TotalSeconds`);
    const m1 = ps(`(Get-Process -Id ${pid}).WorkingSet64`);
    const wall = (Date.now() - t0) / 1000;
    const cpu = (Number(b) - Number(a)) / wall * 100;
    return {
      alive: true,
      pid,
      cpuPercent: Math.round(cpu * 10) / 10,
      workingSetMB: Math.round(Number(m1) / 1048576 * 10) / 10,
      peakWS_MB: Math.round(Number(ps(`(Get-Process -Id ${pid}).PeakWorkingSet64`)) / 1048576 * 10) / 10,
    };
  } catch (error) {
    return { alive: false, error: String(error.message).slice(0, 120) };
  }
}

function systemCpu(seconds = 5) {
  execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 200"');
  const s = ps(`(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \\"Name='_Total'\\").PercentProcessorTime`);
  return Number(s);
}

const pid = bridgePid();
console.log(`房间进程 PID = ${pid}`);

const idle = sample(pid, 5);
console.log(`① 房间在跑（无浏览器在看）：${JSON.stringify(idle)}`);

const sysIdle = systemCpu();
console.log(`   系统 CPU（同一时刻）：${sysIdle}%`);

fs.writeFileSync(
  'D:\\deepseek_workplace\\plugin-dev\\大肥鱼房间插件\\_perf-bridge.json',
  JSON.stringify({ pid, idle, sysIdle, at: new Date().toISOString() }, null, 2),
);
console.log('已写 _perf-bridge.json');
