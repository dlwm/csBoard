// Produces compact, paginated JSON for user-supplied models through WebMCP.
import { ANALYSIS_AREA_PHASES, ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './constants.js';
import { listAnalysisRounds } from './roundModelAccess.js';

const MAP_UNITS_TO_METERS = 0.0254;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const validPosition = (position) => position && [position.x, position.y, position.z].every(Number.isFinite);
const teamSide = (team) => Number(team) === 2 ? 'T' : Number(team) === 3 ? 'CT' : null;
const economyMatches = (matchup, flags) => {
  const [own, opponent] = String(matchup || '').split(':');
  return (flags.economyOwn || ECONOMY_CATEGORIES).includes(own)
    && (flags.economyOpponent || ECONOMY_CATEGORIES).includes(opponent);
};
const rawPosition = (record, prefix) => {
  const x = Number(record?.[`${prefix}_X`]);
  const y = Number(record?.[`${prefix}_Y`]);
  const z = Number(record?.[`${prefix}_Z`]);
  return [x, y, z].every(Number.isFinite)
    ? { x: y * MAP_UNITS_TO_METERS, y: z * MAP_UNITS_TO_METERS, z: x * MAP_UNITS_TO_METERS }
    : null;
};

function currentFilters({ mapName, selectedPlayers, selectedDemos, side, flags }) {
  return {
    map: mapName,
    players: selectedPlayers,
    demos: selectedDemos.map((demo) => ({ id: demo.id, fileName: demo.data?.demo?.fileName || demo.fileName || 'Demo' })),
    side,
    ownEconomy: flags.economyOwn || ECONOMY_CATEGORIES,
    opponentEconomy: flags.economyOpponent || ECONOMY_CATEGORIES,
    analysisType: flags.analysisMetric,
    display: flags.heatStyle,
    kdLocations: {
      killer: Boolean(flags.killerHeat), victim: Boolean(flags.victimHeat),
      target: Boolean(flags.targetHeat), opponent: Boolean(flags.opponentHeat),
    },
    areaPhases: flags.areaPhases || ANALYSIS_AREA_PHASES,
    areaEarlyEndsAtSeconds: clamp(Number(flags.areaEarlySeconds) || 30, 10, 90),
    utilityKinds: flags.utilityKinds || ANALYSIS_UTILITY_KINDS,
    utilityEndpoints: {
      throw: flags.heatStyle === 'points' && flags.utilityThrow !== false,
      landing: flags.utilityLanding !== false,
    },
  };
}

function areaRecords({ rows, selectedPlayers, selectedDemos, side, flags }) {
  const selected = new Set(selectedPlayers);
  const selectedDemoIds = new Set(selectedDemos.map((demo) => demo.id));
  const records = [];
  const rowsByRound = new Map();
  rows.forEach((snapshot) => {
    const id = snapshot.analysisRound?.id;
    if (!id) return;
    if (!rowsByRound.has(id)) rowsByRound.set(id, []);
    rowsByRound.get(id).push(snapshot);
  });
  rowsByRound.forEach((roundRows) => roundRows.forEach((snapshot, index) => {
    const round = snapshot.analysisRound;
    const player = snapshot.players.find((candidate) => selected.has(candidate.name));
    const next = roundRows[index + 1];
    const playerSide = teamSide(player?.team);
    if (!selectedDemoIds.has(round.demoId) || !player || !next || player.health <= 0 || player.hasPosition === false || !validPosition(player.position)) return;
    if (!economyMatches(round.economyMatchup, flags) || side !== 'ALL' && playerSide !== side) return;
    const elapsedTicks = snapshot.tick - round.startTick;
    const postPlant = Number.isFinite(round.plantTick) && snapshot.tick >= round.plantTick;
    const earlySeconds = clamp(Number(flags.areaEarlySeconds) || 30, 10, 90);
    const phase = postPlant ? 'post' : elapsedTicks < (round.tickRate || 64) * earlySeconds ? 'early' : 'mid';
    if (!(flags.areaPhases || ANALYSIS_AREA_PHASES).includes(phase) || snapshot.tick >= round.endTick) return;
    const durationSeconds = clamp((Math.min(next.tick, round.endTick) - snapshot.tick) / (round.tickRate || 64), 0, 0.75);
    if (durationSeconds <= 0) return;
    records.push({
      demoId: round.demoId, fileName: round.fileName, round: round.roundNumber,
      player: player.name, side: playerSide, economyMatchup: round.economyMatchup, phase,
      tick: snapshot.tick, elapsedSeconds: elapsedTicks / (round.tickRate || 64), durationSeconds,
      position: player.position, placeName: player.placeName || '', health: player.health,
      weapon: player.activeWeapon || '', walking: player.walking, crouched: (player.duckAmount || 0) > 0.45,
    });
  }));
  return records;
}

function kdRecords({ deaths, selectedPlayers, selectedDemos, side, flags }) {
  const selected = new Set(selectedPlayers);
  const selectedDemoIds = new Set(selectedDemos.map((demo) => demo.id));
  return deaths.flatMap((event, index) => {
    if (!selectedDemoIds.has(event.analysisDemoId)) return [];
    const attackerSelected = selected.has(event.attacker_name);
    const victimSelected = selected.has(event.user_name);
    const attackerSide = teamSide(event.attacker_team_num);
    const victimSide = teamSide(event.user_team_num);
    const attackerEconomy = event.analysisEconomyByPlayer?.[event.attacker_name] || event.analysisEconomyMatchup;
    const victimEconomy = event.analysisEconomyByPlayer?.[event.user_name] || event.analysisEconomyMatchup;
    const attackerMatches = attackerSelected && economyMatches(attackerEconomy, flags) && (side === 'ALL' || attackerSide === side);
    const victimMatches = victimSelected && economyMatches(victimEconomy, flags) && (side === 'ALL' || victimSide === side);
    const locations = {};
    if (flags.killerHeat && attackerMatches) locations.killer = rawPosition(event, 'attacker');
    if (flags.targetHeat && attackerMatches) locations.target = rawPosition(event, 'user');
    if (flags.victimHeat && victimMatches) locations.victim = rawPosition(event, 'user');
    if (flags.opponentHeat && victimMatches) locations.opponent = rawPosition(event, 'attacker');
    Object.keys(locations).forEach((key) => { if (!locations[key]) delete locations[key]; });
    if (!Object.keys(locations).length) return [];
    return [{
      id: `${event.analysisDemoId || 'demo'}:${event.tick}:${index}`,
      demoId: event.analysisDemoId, fileName: event.analysisFileName, round: event.analysisRound,
      tick: event.tick, timeSeconds: event.timeSeconds ?? event.tick / 64,
      attacker: { name: event.attacker_name || '', side: attackerSide },
      victim: { name: event.user_name || '', side: victimSide },
      weapon: event.weapon || event.weapon_name || '', headshot: Boolean(event.headshot),
      selectedPerspective: { attacker: attackerMatches, victim: victimMatches }, locations,
    }];
  });
}

function utilityRecords({ utilities, selectedPlayers, selectedDemos, side, flags, includeTrajectories }) {
  const selected = new Set(selectedPlayers);
  const selectedDemoIds = new Set(selectedDemos.map((demo) => demo.id));
  return utilities.filter((utility) => (
    selected.has(utility.segment.throwEvent?.user_name)
    && selectedDemoIds.has(utility.source.demoId)
    && (flags.utilityKinds || ANALYSIS_UTILITY_KINDS).includes(utility.kind)
    && economyMatches(utility.economyMatchup, flags)
    && (side === 'ALL' || utility.side === side)
  )).map((utility) => ({
    id: utility.id, demoId: utility.source.demoId, demo: utility.source.fileName, round: utility.source.round,
    player: utility.segment.throwEvent?.user_name || '', side: utility.side,
    economyMatchup: utility.economyMatchup, kind: utility.kind,
    throwTick: utility.segment.throwTick, landingTick: utility.segment.landingTick ?? null,
    throwPosition: flags.heatStyle === 'points' && flags.utilityThrow !== false ? utility.throwPosition : null,
    landingPosition: flags.utilityLanding !== false ? utility.landing : null,
    ...(includeTrajectories ? { trajectory: utility.projectiles || [] } : {}),
  })).filter((utility) => utility.throwPosition || utility.landingPosition);
}

export function getAnalysisModelContext(options) {
  const filters = currentFilters(options);
  const language = options.language === 'zh' ? 'zh' : options.language === 'ru' ? 'ru' : 'en';
  const ready = options.activePanel === 'analysis' && selectedReady(options);
  const prompts = language === 'zh' ? [
    '你是一名 CS2 战术分析助手。先复述当前筛选范围，再只依据分页 JSON 中的记录总结模式、异常与可验证的改进建议。',
    '比较不同选手、阵营或经济条件时，先报告样本量与回合覆盖，避免把事件数量直接当成效率。',
    '分析区域时间时结合 phase、durationSeconds 和 placeName；分析道具时区分出手点、落点与轨迹，不要把地图坐标推断成因果关系。',
  ] : [
    'Act as a CS2 tactical analyst. Restate the active filters, then use only the paginated JSON records to identify patterns, outliers, and testable improvements.',
    'Before comparing players, sides, or economies, report sample and round coverage; raw event counts are not rates.',
    'For area time, use phase, durationSeconds, and placeName. For utility, distinguish throw, landing, and trajectory; spatial correlation alone is not causation.',
  ];
  return {
    ready,
    status: options.activePanel !== 'analysis' ? 'open-analysis-panel'
      : options.playersLoading ? 'loading'
        : options.status || (ready ? 'ready' : 'selection-required'),
    filters,
    availableDatasets: ['current', 'kd', 'area', 'utility'],
    roundAnalysis: {
      tool: 'get_round_analysis',
      availableDemos: listAnalysisRounds(options.selectedDemos),
      workflow: 'Choose demoId and round, read dataset=context, then paginate timeline/events/utility. Full-round analysis includes both teams regardless of player/side/economy filters.',
    },
    rawCounts: { movementSnapshots: options.rows.length, deaths: options.deaths.length, utilities: options.utilities.length },
    dataGuide: {
      coordinates: 'Meters in CSBoard scene axes: x=east/west, y=height, z=north/south. Positions are not NAV-area labels.',
      teams: { T: 2, CT: 3 },
      economies: ECONOMY_CATEGORIES,
      phases: { early: `freeze end to ${filters.areaEarlyEndsAtSeconds}s`, mid: `${filters.areaEarlyEndsAtSeconds}s to bomb plant or round end`, post: 'bomb plant to round end' },
      sampling: 'Movement is sampled from Demo ticks; durationSeconds weights area-time samples. KD and utility records are discrete events.',
      pagination: 'Call get_filtered_analysis_data repeatedly with nextOffset until hasMore is false. Request trajectories only when their shape is needed.',
      visualContext: 'Call capture_3d_view when spatial layout matters. It captures the current 3D canvas and reports the camera, map, playback tick, and active Analysis selection.',
    },
    promptTemplates: prompts,
  };
}

const selectedReady = (options) => Boolean(options.selectedPlayers.length && options.selectedDemos.length && !options.playersLoading);

export function getFilteredAnalysisData(options, request = {}) {
  const requestedDataset = request.dataset === 'current' || !request.dataset ? options.flags.analysisMetric : request.dataset;
  if (!['kd', 'area', 'utility'].includes(requestedDataset)) throw new Error(`Unsupported analysis dataset: ${requestedDataset}`);
  if (!selectedReady(options)) throw new Error(options.playersLoading ? 'Analysis data is still loading.' : 'Select at least one player and Demo in Analysis first.');
  const builders = {
    area: () => areaRecords(options),
    kd: () => kdRecords(options),
    utility: () => utilityRecords({ ...options, includeTrajectories: Boolean(request.includeTrajectories) }),
  };
  const records = builders[requestedDataset]();
  const offset = Math.max(0, Math.floor(Number(request.offset) || 0));
  const limit = clamp(Math.floor(Number(request.limit) || 100), 1, 200);
  const page = records.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    schemaVersion: 1,
    dataset: requestedDataset,
    filters: currentFilters(options),
    pagination: { offset, limit, total: records.length, returned: page.length, hasMore: nextOffset < records.length, nextOffset: nextOffset < records.length ? nextOffset : null },
    records: page,
  };
}
