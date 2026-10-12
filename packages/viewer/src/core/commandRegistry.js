// Application commands are independent of React and concrete platform drivers.
// 命令注册表不依赖 React 或平台；界面、快捷键与助手复用同一入口。
export function createCommandRegistry(definitions, { before = () => {}, after = () => {} } = {}) {
  const commands = new Map(Object.entries(definitions));
  return Object.freeze({
    names: Object.freeze([...commands.keys()]),
    execute(name, args = {}, context = {}) {
      const command = commands.get(name);
      if (!command) throw new Error(`Unknown application command: ${name}`);
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('Command arguments must be an object');
      before(name, args, context);
      const result = command(args, context);
      if (result && typeof result.then === 'function') return result.then(value => { after(name, args, value, context); return value; });
      after(name, args, result, context); return result;
    },
  });
}
