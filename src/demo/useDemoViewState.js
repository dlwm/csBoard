import { useMemo } from 'react';
import * as THREE from 'three';
import { roundEconomy, roundSideSignature, sidesSwitched } from './economy.js';
import { interpolateDemoSnapshot } from './interpolation.js';
import { buildDemoGrenadeSegments } from './grenades.js';
import { buildDemoReloads, demoEventPlayerMatches } from './playerState.js';
import { roundReasonLabel, roundWinnerSide } from './rounds.js';
import { demoPovRuntime, demoRosterRuntime } from '../three/runtime.js';

// Derive all read-only replay presentation data from the current Demo tick.
export default function useDemoViewState({ activePanel, demoData, demoPovPlayerId, demoProjectiles, demoRound, demoSnapshots, demoThrowSnapshots, demoTick, language, setDemoCameraMode, setDemoPovPlayerId, t }) {
  const tickRate = demoData?.demo.tickRate || 64;
  const demoSnapshot = demoRound && (demoTick < demoRound.startTick || demoTick > demoRound.endTick) ? null : interpolateDemoSnapshot(demoSnapshots, demoTick);
  const demoReloads = useMemo(() => buildDemoReloads(demoSnapshots, demoData?.events || [], tickRate), [demoSnapshots, demoData?.events, tickRate]);
  const demoGrenadeSegments = useMemo(() => buildDemoGrenadeSegments(demoProjectiles, demoData?.events || [], demoThrowSnapshots, demoRound, tickRate), [demoProjectiles, demoData?.events, demoThrowSnapshots, demoRound, tickRate]);
  const demoTeams = { T: demoSnapshot?.players.filter((player) => player.team === 2) || [], CT: demoSnapshot?.players.filter((player) => player.team === 3) || [] };
  const demoPovPlayer = demoSnapshot?.players.find((player) => String(player.steamid || player.name) === demoPovPlayerId && player.health > 0 && player.hasPosition !== false) || null;
  const demoPovFiring = Boolean(demoPovPlayer && demoData?.events?.some((event) => event.event_name === 'weapon_fire' && demoEventPlayerMatches(event, demoPovPlayer) && event.tick <= demoTick && demoTick - event.tick < 8));
  const demoPovHurt = Boolean(demoPovPlayer && demoData?.events?.some((event) => event.event_name === 'player_hurt' && demoEventPlayerMatches(event, demoPovPlayer) && event.tick <= demoTick && demoTick - event.tick < 10));
  const toggleDemoPov = (player) => {
    const id = String(player.steamid || player.name);
    setDemoCameraMode('manual');
    setDemoPovPlayerId((current) => current === id ? '' : id);
  };
  const interruptDemoCamera = () => { setDemoCameraMode('manual'); setDemoPovPlayerId(''); };

  demoRosterRuntime.snapshots = demoSnapshots;
  demoRosterRuntime.reloads = demoReloads;
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
  const demoC4Events = demoData?.events?.filter((event) => demoRound && ['bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused', 'round_end'].includes(event.event_name) && event.tick >= demoRound.startTick && event.tick <= demoRound.endTick) || [];
  const demoHltvEvents = demoData?.events?.filter((event) => demoRound && ['hltv_fixed', 'hltv_chase'].includes(event.event_name) && event.tick >= (demoRound.freezeStartTick ?? demoRound.startTick) && event.tick <= demoRound.endTick) || [];
  const timelineEvents = demoData?.events?.filter((event) => demoRound && ['player_death', 'bomb_planted', 'bomb_exploded', 'round_end'].includes(event.event_name) && event.tick >= demoRound.startTick && event.tick <= demoRound.endTick).map((event) => ({ ...event, label: event.event_name === 'player_death' ? '×' : event.event_name === 'bomb_planted' ? '↓' : event.event_name === 'bomb_exploded' ? '💥' : '□', title: event.event_name === 'player_death' ? `${event.attacker_name || t('world')} ${t('killed')} ${event.user_name || t('unknown')}` : event.event_name === 'bomb_planted' ? t('c4Planted') : event.event_name === 'bomb_exploded' ? t('c4Exploded') : t('roundEnd') })) || [];
  const c4TimerTicks = useMemo(() => {
    const events = demoData?.events || [];
    const durations = events.filter((event) => event.event_name === 'bomb_planted').map((plant) => {
      const nextPlant = events.find((event) => event.event_name === 'bomb_planted' && event.tick > plant.tick);
      const explosion = events.find((event) => event.event_name === 'bomb_exploded' && event.tick > plant.tick && (!nextPlant || event.tick < nextPlant.tick));
      return explosion ? explosion.tick - plant.tick : null;
    }).filter((duration) => duration > 0).sort((left, right) => left - right);
    return durations.length ? durations[Math.floor(durations.length / 2)] : 40 * 64;
  }, [demoData?.events]);
  const c4Plant = [...demoC4Events].reverse().find((event) => event.event_name === 'bomb_planted' && event.tick <= demoTick);
  const c4Terminal = c4Plant && demoC4Events.find((event) => ['bomb_exploded', 'bomb_defused'].includes(event.event_name) && event.tick >= c4Plant.tick);
  const c4DisplayTick = c4Terminal?.event_name === 'bomb_defused' && demoTick >= c4Terminal.tick ? c4Terminal.tick : demoTick;
  const c4EndTick = c4Terminal?.event_name === 'bomb_exploded' ? c4Terminal.tick : c4Plant ? c4Plant.tick + c4TimerTicks : null;
  const c4Countdown = c4Plant && (!c4Terminal || c4Terminal.event_name === 'bomb_defused' || demoTick <= c4Terminal.tick) ? Math.max(0, (c4EndTick - c4DisplayTick) / tickRate) : null;
  const roundEndEvent = demoC4Events.find((event) => event.event_name === 'round_end' && event.tick <= demoTick);
  const roundCountdownSeconds = Math.ceil(demoRound ? Math.max(0, 115 - (demoTick - demoRound.startTick) / tickRate) : 0);
  const roundClock = `${Math.floor(roundCountdownSeconds / 60)}:${String(roundCountdownSeconds % 60).padStart(2, '0')}`;
  const roundWinner = roundEndEvent ? roundWinnerSide(roundEndEvent.winner ?? demoRound?.winner) : null;
  const roundResult = roundEndEvent ? `${roundWinner || '-'} · ${roundReasonLabel(roundEndEvent.reason || demoRound?.reason, language)}` : '';
  const currentDefuser = demoSnapshot?.players.find((player) => player.defusing);
  const currentSnapshotIndex = currentDefuser ? demoSnapshots.findLastIndex((snapshot) => snapshot.tick <= demoTick) : -1;
  const defuseStartEvent = currentDefuser ? [...demoC4Events].reverse().find((event) => event.event_name === 'bomb_begindefuse' && event.tick <= demoTick && (demoEventPlayerMatches(event, currentDefuser) || !event.user_steamid && !event.user_name)) : null;
  let defuseStartTick = defuseStartEvent?.tick ?? (currentSnapshotIndex >= 0 ? demoSnapshots[currentSnapshotIndex].tick : null);
  if (currentDefuser && !defuseStartEvent) for (let index = currentSnapshotIndex - 1; index >= 0; index -= 1) {
    if (!demoSnapshots[index].players.some((player) => player.name === currentDefuser.name && player.defusing)) break;
    defuseStartTick = demoSnapshots[index].tick;
  }
  const defuseDurationTicks = (currentDefuser?.hasDefuser ? 5 : 10) * tickRate;
  const defuseProgress = currentDefuser && defuseStartTick != null ? THREE.MathUtils.clamp((demoTick - defuseStartTick) / defuseDurationTicks, 0, 1) : null;

  return { c4Countdown, c4Terminal, currentDefuser, defuseProgress, demoC4Events, demoDeaths, demoGrenadeSegments, demoHltvEvents, demoKills, demoPovFiring, demoPovHurt, demoPovPlayer, demoReloads, demoRoundEconomies, demoScore, demoSideSwitchRounds, demoSnapshot, demoTeams, interruptDemoCamera, roundClock, roundResult, roundWinner, timelineEvents, toggleDemoPov };
}
