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
    async *iterateGrenades(part, props) {
      let offset = 0;
      for (;;) {
        const page = await call('grenades', part, { props, offset, limit: 512 });
        // Older transports can still return an array; current hosts stream pages.
        // 旧引擎仍可返回数组，新引擎按页交付，业务层不积累整包原始日志。
        if (Array.isArray(page)) { yield* page; return; }
        if (!Array.isArray(page?.rows) || !Number.isInteger(page.total) || page.total < offset + page.rows.length) throw new Error('Invalid grenade page');
        yield* page.rows;
        if (page.nextOffset == null) {
          if (offset + page.rows.length !== page.total) throw new Error('Incomplete grenade journal');
          return;
        }
        if (!page.rows.length || page.nextOffset !== offset + page.rows.length) throw new Error('Invalid grenade page offset');
        offset = page.nextOffset;
      }
    },
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
