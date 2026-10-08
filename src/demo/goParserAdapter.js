// Both transports use the same query and missing-value conventions.
function parserValue(value) {
  if (value === null) return undefined;
  if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = parserValue(value[key]);
  return value;
}

export function createGoParserAdapter({ init, openSources, request, compactTicks = false }) {
  const call = async (method, part, args = {}) => parserValue(await request(method, { part: part.part, ...args }));
  return {
    init, openSources,
    parseHeader: part => call('header', part),
    parseVoice: part => call('voice', part),
    parseEvents: (part, events, props) => call('events', part, { events, props }),
    parseGrenades: (part, props) => call('grenades', part, { props }),
    prepareTicks: (part, props, ticks, throws = []) => call('prepareTicks', part, { props, ticks: Array.from(ticks), throws }),
    releaseTicks: part => call('releaseTicks', part),
    parseTicks: async (part, props, ticks, players) => {
      const value = await call('ticks', part, { props, ticks: Array.from(ticks), players, ...(compactTicks ? { format: 'columns' } : {}) });
      // Keep wire compression in the adapter; replay/analysis still consume
      // identical row objects. 列式格式仅用于传输，业务层无需区分宿主或引擎。
      if (Array.isArray(value)) return value;
      if (!Array.isArray(value?.columns) || !Array.isArray(value.rows)) throw new Error('Invalid tick table');
      // Reuse entries and construct each complete object in one operation.
      // Incremental insertion of dozens of keys can turn V8 objects into
      // dictionaries, multiplying memory for dense pre-throw samples.
      // 复用字段模板一次创建对象，避免几十个字段逐项插入触发字典存储。
      const entries = value.columns.map(column => [column, undefined]);
      return value.rows.map(values => {
        if (!Array.isArray(values) || values.length !== entries.length) throw new Error('Invalid tick row width');
        for (let index = 0; index < entries.length; index += 1) entries[index][1] = values[index];
        return Object.fromEntries(entries);
      });
    },
  };
}
