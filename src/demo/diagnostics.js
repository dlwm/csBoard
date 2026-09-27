export function resultDiagnostic(data, estimatedBytes, elapsedMs) {
  return {
    map: data.demo.map,
    patch: data.demo.patch,
    demoVersion: data.demo.version,
    demoGuid: data.demo.guid,
    server: data.demo.serverName,
    client: data.demo.clientName,
    durationSeconds: data.demo.durationSeconds,
    maxTick: data.demo.maxTick,
    sampleRate: data.demo.sampleRate,
    rounds: data.summary.rounds,
    kills: data.summary.kills,
    damageEvents: data.summary.damageEvents,
    shots: data.summary.shots,
    players: data.summary.players,
    warnings: data.warnings || [],
    sourceBytes: data.demo.bytes,
    estimatedOutputBytes: estimatedBytes,
    elapsedMs,
  };
}

