// Both transports use the same query and missing-value conventions.
function parserValue(value) {
  if (value === null) return undefined;
  if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = parserValue(value[key]);
  return value;
}

export function createGoParserAdapter({ init, openSources, request }) {
  const call = async (method, part, args = {}) => parserValue(await request(method, { part: part.part, ...args }));
  return {
    init, openSources,
    parseHeader: part => call('header', part),
    parseEvents: (part, events, props) => call('events', part, { events, props }),
    parseGrenades: (part, props) => call('grenades', part, { props }),
    prepareTicks: (part, props, ticks) => call('prepareTicks', part, { props, ticks: Array.from(ticks) }),
    releaseTicks: part => call('releaseTicks', part),
    parseTicks: (part, props, ticks, players) => call('ticks', part, { props, ticks: Array.from(ticks), players }),
  };
}
