import { getDemoBombState } from './bombTimeline.js';
import { getDemoPlayerTimeline, demoPlayerId } from './playerTimeline.js';
import { localize } from '../i18n.js';
import { useMemo } from 'react';
import * as THREE from 'three';
import { roundEconomy, roundSideSignature, sidesSwitched } from './economy.js';
import { interpolateDemoSnapshot } from './interpolation.js';
import { buildDemoGrenadeSegments } from './grenades.js';
import { buildDemoReloads } from './playerState.js';
import { buildMonitorRoster, mergeMonitorSnapshot } from './monitorPlayers.js';
import { roundReasonLabel, roundWinnerSide } from './rounds.js';
import { demoPovRuntime, demoRosterRuntime } from '../three/runtime.js';

// Derive all read-only replay presentation data from the current Demo tick.
export default function useDemoViewState({ activePanel, demoCameraMode, demoData, demoPovPlayerId, demoProjectiles, demoRound, demoSnapshots, demoThrowSnapshots, demoTick, language, setDemoCameraMode, setDemoPovPlayerId, t }) {
  const tickRate = demoData?.demo.tickRate || 64;
  const demoReloads = useMemo(() => buildDemoReloads(demoSnapshots, demoData?.events || [], tickRate), [demoSnapshots, demoData?.events, tickRate]);
  const playerTimeline = useMemo(() => getDemoPlayerTimeline(demoSnapshots, demoData?.events || [], tickRate), [demoSnapshots, demoData?.events, tickRate]);
  const demoSnapshot = demoRound && (demoTick < (demoRound.freezeStartTick ?? demoRound.startTick) || demoTick > demoRound.endTick) ? null : interpolateDemoSnapshot(demoSnapshots, demoTick, tickRate);
  const demoGrenadeSegments = useMemo(() => buildDemoGrenadeSegments(demoProjectiles, demoData?.events || [], demoThrowSnapshots, demoRound, tickRate), [demoProjectiles, demoData?.events, demoThrowSnapshots, demoRound, tickRate]);
  const demoTeams = { T: demoSnapshot?.players.filter((player) => player.team === 2) || [], CT: demoSnapshot?.players.filter((player) => player.team === 3) || [] };
  const recording = demoData?.demo.kind === 'recording';
  const monitorRoster = useMemo(() => recording ? [] : buildMonitorRoster(demoSnapshots), [demoSnapshots, recording]);
  const demoMonitorPlayers = recording ? (demoSnapshot?.players || []).map(player => ({ ...player, monitorId: String(player.steamid || player.name) })) : mergeMonitorSnapshot(monitorRoster, demoSnapshot);
  const demoPovPlayer = demoSnapshot?.players.find((player) => String(player.steamid || player.name) === demoPovPlayerId && player.health > 0 && player.hasPosition !== false) || null;
  const fireEvent = demoPovPlayer && playerTimeline.latest(demoPlayerId(demoPovPlayer), 'weapon_fire', demoTick, .125);
  const hurtEvent = demoPovPlayer && playerTimeline.latest(demoPlayerId(demoPovPlayer), 'player_hurt', demoTick, .15625);
  const demoPovFiring = Boolean(fireEvent && demoTick - fireEvent.tick < tickRate * .125);
  const demoPovHurt = Boolean(hurtEvent && demoTick - hurtEvent.tick < tickRate * .15625);
  const demoPovHurtAgeSeconds = hurtEvent ? Math.max(0, (demoTick - hurtEvent.tick) / tickRate) : null;
  const toggleDemoPov = (player) => {
    const id = String(player.steamid || player.name);
    if (demoCameraMode === 'monitor') { setDemoPovPlayerId(id); return; }
    setDemoCameraMode('manual');
    setDemoPovPlayerId((current) => current === id ? '' : id);
  };
  const interruptDemoCamera = () => { setDemoCameraMode('manual'); setDemoPovPlayerId(''); };

  demoRosterRuntime.snapshots = demoSnapshots;
  demoRosterRuntime.reloads = demoReloads;
  demoRosterRuntime.timeline = playerTimeline;
  demoRosterRuntime.monitorPlayers = demoMonitorPlayers;
  demoPovRuntime.player = demoPovPlayer;
  demoPovRuntime.playerId = demoPovPlayerId;
  demoPovRuntime.toggle = toggleDemoPov;
  demoPovRuntime.interrupt = interruptDemoCamera;

  const demoRoundEconomies = useMemo(() => new Map((demoData?.rounds || []).map((round) => [round.round, roundEconomy(round, demoData.roundData?.find((item) => item.round === round.round))])), [demoData]);
  const demoSideSwitchRounds = useMemo(() => {
    const switches = new Set();
    const rounds = demoData?.rounds || [];
    for (let index = 1; index < rounds.length; index += 1) {
      const previous = roundSideSignature(demoData.roundData?.find((item) => item.round === rounds[index - 1].round));
      const current = roundSideSignature(demoData.roundData?.find((item) => item.round === rounds[index].round));
      if (sidesSwitched(previous, current)) switches.add(rounds[index].round);
    }
    return switches;
  }, [demoData]);
  const demoScore = { T: demoTeams.T[0]?.score || 0, CT: demoTeams.CT[0]?.score || 0 };
  const demoKillLifetime = tickRate * 5;
  const demoKills = activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= Math.max(demoRound.startTick, demoTick - demoKillLifetime) && event.tick <= demoTick).reverse() || [] : [];
  const demoDeaths = demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick) || [];
  const demoC4Events = useMemo(() => demoData?.events?.filter((event) => demoRound && ['bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused', 'round_end'].includes(event.event_name) && event.tick >= (demoRound.freezeStartTick ?? demoRound.startTick) && event.tick <= demoRound.endTick) || [], [demoData?.events, demoRound]);
  const demoHltvEvents = useMemo(() => demoData?.events?.filter((event) => demoRound && ['hltv_fixed', 'hltv_chase'].includes(event.event_name) && event.tick >= (demoRound.freezeStartTick ?? demoRound.startTick) && event.tick <= demoRound.endTick) || [], [demoData?.events, demoRound]);
  const timelineEvents = demoData?.events?.filter((event) => demoRound && ['player_death', 'bomb_planted', 'bomb_exploded', 'round_end'].includes(event.event_name) && event.tick >= demoRound.startTick && event.tick <= demoRound.endTick).map((event) => ({ ...event, label: event.event_name === 'player_death' ? '×' : event.event_name === 'bomb_planted' ? '↓' : event.event_name === 'bomb_exploded' ? '💥' : '□', title: event.event_name === 'player_death' ? `${event.attacker_name || t('world')} ${t('killed')} ${event.user_name || t('unknown')}` : event.event_name === 'bomb_planted' ? t('c4Planted') : event.event_name === 'bomb_exploded' ? t('c4Exploded') : t('roundEnd') })) || [];
  const bomb = getDemoBombState(demoC4Events, demoSnapshots, tickRate, demoTick);
  const c4Countdown = bomb.countdownSeconds;
  const c4Terminal = bomb.terminal && ['bomb_exploded', 'bomb_defused'].includes(bomb.terminal.type) ? { event_name: bomb.terminal.type, tick: bomb.terminal.tick } : null;
  const roundEndEvent = demoC4Events.find((event) => event.event_name === 'round_end' && event.tick <= demoTick);
  const frozen = demoRound && demoTick < demoRound.startTick;
  const roundCountdownSeconds = Math.ceil(demoRound ? Math.max(0, frozen ? (demoRound.startTick - demoTick) / tickRate : 115 - (demoTick - demoRound.startTick) / tickRate) : 0);
  const roundClock = `${frozen ? localize(language, { zh: '冻结', en: 'Freeze', ru: 'Заморозка' }) + ' ' : ''}${Math.floor(roundCountdownSeconds / 60)}:${String(roundCountdownSeconds % 60).padStart(2, '0')}`;
  const roundWinner = roundEndEvent ? roundWinnerSide(roundEndEvent.winner ?? demoRound?.winner) : null;
  const roundResult = roundEndEvent ? `${roundWinner || '-'} · ${roundReasonLabel(roundEndEvent.reason || demoRound?.reason, language)}` : '';
  const currentDefuser = bomb.currentDefuser;
  const defuseProgress = currentDefuser ? bomb.defuseProgress : null;

  return { c4Countdown, c4Terminal, currentDefuser, defuseProgress, demoC4Events, demoDeaths, demoGrenadeSegments, demoHltvEvents, demoKills, demoMonitorPlayers, demoPovFiring, demoPovHurt, demoPovHurtAgeSeconds, demoPovPlayer, demoReloads, demoRoundEconomies, demoScore, demoSideSwitchRounds, demoSnapshot, demoTeams, interruptDemoCamera, roundClock, roundResult, roundWinner, timelineEvents, toggleDemoPov };
}
