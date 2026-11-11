/**
 * 房间进程启停：先停占用 13100 的，再 detached 拉起 src/bridge.js。
 * 用法：node _room-service.cjs start|stop|status
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOM_ROOT = 'D:/deepseek_workplace/plugin-dev/大肥鱼房间插件/_src/feiyu-room-template-main';
const NODE = 'D:/deepseek/resources/runtime/primary-runtime/dependencies/node/bin/node.exe';
const PORT = 13100;

function listeningPids() {
  try {
    const out = execSync(`netstat -ano | findstr ":${PORT}"`, { encoding: 'utf8' });
    return out
      .split(/\r?\n/)
      .filter((l) => l.includes('LISTENING'))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((v) => /^\d+$/.test(v));
  } catch {
    return [];
  }
}

const mode = process.argv[2] || 'status';

if (mode === 'status') {
  const pids = listeningPids();
  console.log(JSON.stringify({ port: PORT, listening: pids.length > 0, pids }));
  process.exit(0);
}

if (mode === 'stop') {
  const pids = listeningPids();
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } catch {
      /* 已退出 */
    }
  }
  console.log(JSON.stringify({ stopped: pids }));
  process.exit(0);
}

if (mode === 'start') {
  const existing = listeningPids();
  if (existing.length > 0) {
    console.log(JSON.stringify({ already: existing }));
    process.exit(0);
  }
  const logs = path.join(ROOM_ROOT, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const out = fs.openSync(path.join(logs, 'bridge.log'), 'a');
  const err = fs.openSync(path.join(logs, 'bridge.err.log'), 'a');
  const child = spawn(NODE, ['src/bridge.js'], {
    cwd: ROOM_ROOT,
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
  });
  child.unref();
  console.log(JSON.stringify({ started: child.pid }));
  process.exit(0);
}

console.log('用法: node _room-service.cjs start|stop|status');
