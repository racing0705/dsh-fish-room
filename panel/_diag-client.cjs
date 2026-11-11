/**
 * 复刻前端启动检查：跑 client.js 的 factory + apply，验证「任何失败都不会抛」。
 * 模拟三种宿主环境：①正常 slots ②ctx.slots 缺失 ③ctx.slots.inject 抛错
 */
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(
  'D:/deepseek_workplace/plugin-dev/plugins/dsh-fish-room-panel/client.js',
  'utf8',
);

const anyFn = () => anyFn;
const ReactStub = new Proxy({}, { get: () => anyFn, apply: () => ReactStub });
ReactStub.createElement = (type, props, ...kids) => ({ type, props, kids });

function run(label, ctx) {
  let result = { label };
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ id, factory }) {
          const m = factory((n) => (n === 'react' ? ReactStub : (() => { throw new Error('未提供依赖 ' + n); })()));
          result.id = id;
          result.exports = Object.keys(m);
          result.inject = m.inject;
          try {
            m.apply(ctx);
            result.applyOk = true;
          } catch (error) {
            result.applyOk = false;
            result.applyError = error && error.message;
          }
        },
      },
    },
    console,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} },
    location: { origin: 'http://127.0.0.1:1', search: '' },
    fetch: () => Promise.reject(new Error('no net')),
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox.window;
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox);
  } catch (error) {
    result.threw = error && error.message;
  }
  return result;
}

const registered = [];
const mkSlots = () => ({
  inject: (slot, fn) => fn(),
  register: (spec) => {
    registered.push(spec && (spec.key || spec.id || spec.name));
    return () => {};
  },
});

console.log('① 正常宿主:', JSON.stringify(run('normal', { slots: mkSlots(), fetch: async () => ({}) })));
console.log('   注册到的槽位:', JSON.stringify(registered));

console.log('② ctx.slots 缺失:', JSON.stringify(run('no-slots', {})));
console.log('③ slots.inject 抛错:', JSON.stringify(run('bad-slots', {
  slots: { inject: () => { throw new Error('宿主注入器坏了'); }, register: () => () => {} },
})));
console.log('④ ctx 完全为空:', JSON.stringify(run('null-ctx', null)));
