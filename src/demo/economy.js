// Classifies each round's team economy and derives player-relative matchups.
function classifyTeamEconomy(players, roundNumber) {
  const valid = players.filter((player) => [player.currentEquipValue, player.roundStartEquipValue, player.cashSpentThisRound, player.balance].some(Number.isFinite));
  if (valid.length < 4) return { label: 'UNKNOWN', value: 0 };
  const values = valid.map((player) => Number.isFinite(player.currentEquipValue) ? player.currentEquipValue : Number(player.roundStartEquipValue) || 0);
  const totalEquip = values.reduce((sum, value) => sum + value, 0);
  const totalSpend = valid.reduce((sum, player) => sum + (Number(player.cashSpentThisRound) || 0), 0);
  const totalBalance = valid.reduce((sum, player) => sum + (Number(player.balance) || 0), 0);
  const averageEquip = totalEquip / valid.length;
  const averageSpend = totalSpend / valid.length;
  const averageBalance = totalBalance / valid.length;
  const commitment = totalSpend / Math.max(1, totalSpend + totalBalance);
  const pistolRound = roundNumber === 1 || roundNumber === 13;
  if (pistolRound && averageEquip < 1800) return { label: 'PISTOL', value: totalEquip };
  if (averageEquip >= 4000 && values.filter((value) => value >= 3000).length >= 4) return { label: 'FULL', value: totalEquip };
  if (averageEquip < 1500 && averageSpend <= 800 && values.filter((value) => value >= 2500).length <= 1) return { label: 'ECO', value: totalEquip };
  if (averageBalance >= 1500 && commitment < 0.65) return { label: 'HALF', value: totalEquip };
  return { label: 'FORCE', value: totalEquip };
}

export function roundEconomy(round, roundData) {
  const snapshot = roundData?.snapshots?.find((item) => item.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData?.snapshots?.[0];
  const t = classifyTeamEconomy(snapshot?.players.filter((player) => player.team === 2) || [], Number(round.round));
  const ct = classifyTeamEconomy(snapshot?.players.filter((player) => player.team === 3) || [], Number(round.round));
  return { T: t, CT: ct, split: t.value + ct.value > 0 ? t.value / (t.value + ct.value) * 100 : 50 };
}

export function roundSideSignature(roundData) {
  const snapshot = roundData?.snapshots?.find((item) => item.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData?.snapshots?.[0];
  return new Map((snapshot?.players || []).filter((player) => player.steamid && (player.team === 2 || player.team === 3)).map((player) => [String(player.steamid), player.team]));
}

export function sidesSwitched(previous, current) {
  let compared = 0;
  let switched = 0;
  current.forEach((team, steamid) => {
    const previousTeam = previous.get(steamid);
    if (!previousTeam) return;
    compared += 1;
    if (previousTeam !== team) switched += 1;
  });
  return compared >= 6 && switched / compared >= 0.75;
}
