// Demo playback HUD: kill feed, team rosters, and first-person status.
import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import { KillIcon, RawIcon, RosterIcon, RosterWeaponIcon, grenadeIconKey } from '../components/CsIcons.jsx';
import { demoPovRuntime, demoRosterRuntime } from '../three/runtime.js';
import { demoEventPlayerMatches, demoPlayerReload, demoWeaponKind, recentPlayerBalanceChange } from './playerState.js';
import { monitorTeamPrimary, sameTeamMonitorPlayers } from './monitorPlayers.js';

function playerGrenadeIcons(inventory, noGrenadesLabel, hasC4 = false) {
  const counts = new Map();
  (inventory || []).forEach((item) => {
    const rawName = typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item;
    const key = grenadeIconKey(rawName);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  if (hasC4) counts.set('c4', 1);
  if (!counts.size) return noGrenadesLabel;
  return <span className="roster-grenades">{[...counts].map(([key, count]) => <span className="roster-grenade" key={key}><RawIcon name={key} /><i>{count > 1 ? count : ''}</i></span>)}</span>;
}

export function DemoKillFeed({ kills, round, collapsed, onToggle, translate }) {
  return <div className={`demo-kills${collapsed ? ' collapsed' : ''}`}><div className="demo-kills-heading"><span>{translate('recentKills')}</span><button type="button" onClick={onToggle}>{collapsed ? translate('expand') : translate('collapse')}</button></div>{kills.map((kill, index) => <div className="demo-kill" key={`${kill.tick}-${kill.user_steamid}`} style={{ '--kill-opacity': Math.max(0.16, 1 - Math.max(0, index - 2) * 0.25) }}>
    <small>{((kill.tick - round.startTick) / 64).toFixed(1)}s</small>
    <b>{kill.attacker_name || translate('world')}{kill.assister_name && <span className={kill.assistedflash ? 'flash-assist' : ''}> + {kill.assister_name}{kill.assistedflash && <KillIcon type="blind" />}</span>}</b>
    <i title={String(kill.weapon || 'kill').replace(/^weapon_/, '')}><KillIcon type="weapon" weapon={kill.weapon} side={Number(kill.attacker_team_num) === 2 ? 'T' : 'CT'} event />{kill.headshot && <KillIcon type="headshot" />}{kill.thrusmoke && <KillIcon type="smoke" />}{kill.attackerblind && <KillIcon type="blind" />}{Number(kill.penetrated) > 0 && <KillIcon type="wallbang" />}{kill.noscope && <KillIcon type="noscope" />}{kill.attackerinair && <KillIcon type="airborne" />}</i>
    <strong>{kill.user_name || translate('unknown')}</strong>
  </div>)}</div>;
}

export function DemoDataWarning({ warnings, translate }) {
  const players = [...new Set((warnings || [])
    .filter((warning) => warning.type === 'missing-player-position')
    .flatMap((warning) => warning.players || [])
    .map((player) => player.name)
    .filter(Boolean))];
  if (!players.length) return null;
  return <div className="demo-data-warning" role="alert">
    <b>! {translate('demoDataIncomplete')}</b>
    <span>{translate('demoMissingPlayerPosition', { players: players.join(', ') })}</span>
  </div>;
}

export function DemoRoster({ side, players, events, tick, round, tickRate, povPlayerId, onPlayerPov, noGrenadesLabel }) {
  const snapshots = demoRosterRuntime.snapshots;
  const selectedPovId = povPlayerId ?? demoPovRuntime.playerId;
  const selectPov = onPlayerPov || demoPovRuntime.toggle;
  return <div className={`team-roster team-roster-${side.toLowerCase()}`}><span>{side} SIDE</span>{players.map((player) => {
    const recentHurt = [...events].reverse().find((event) => event.event_name === 'player_hurt' && event.tick <= tick && tick - event.tick <= tickRate * 1.6 && demoEventPlayerMatches(event, player));
    const hurtAge = recentHurt ? (tick - recentHurt.tick) / tickRate : Infinity;
    const hurtStartHealth = Math.min(100, Math.max(Number(player.health) || 0, Number(recentHurt?.health ?? player.health) + Number(recentHurt?.dmg_health || 0)));
    const delayedHealth = hurtAge <= 1 ? hurtStartHealth : THREE.MathUtils.lerp(hurtStartHealth, Number(player.health) || 0, THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((hurtAge - 1) / 0.6, 0, 1), 0, 1));
    const recentPurchases = events.filter((event) => event.event_name === 'item_purchase' && event.tick <= tick && tick - event.tick <= tickRate * 1.5 && demoEventPlayerMatches(event, player));
    const openingSpend = tick <= round.startTick + tickRate * 1.5 ? events.filter((event) => event.event_name === 'item_purchase' && event.tick >= (round.freezeStartTick ?? round.startTick) && event.tick <= round.startTick && demoEventPlayerMatches(event, player)).reduce((sum, event) => sum + (event.was_sold ? -1 : 1) * Math.abs(Number(event.cost) || 0), 0) : 0;
    const purchaseDelta = recentPurchases.reduce((sum, event) => sum + (event.was_sold ? 1 : -1) * Math.abs(Number(event.cost) || 0), 0) || (openingSpend ? -openingSpend : 0);
    const balanceChange = recentPlayerBalanceChange(snapshots, player, tick, tickRate);
    const moneyDelta = balanceChange?.delta || purchaseDelta;
    const moneyKey = balanceChange ? `balance-${balanceChange.tick}-${balanceChange.delta}` : recentPurchases.map((event) => event.tick).join('-') || (openingSpend ? `opening-${round.round}` : 'none');
    const flashDuration = Math.max(0, Number(player.flashDuration) || 0);
    const flashStrength = Number(player.flashMaxAlpha) > 0 ? Number(player.flashMaxAlpha) / 255 : flashDuration > 0 ? 1 : 0;
    const flashProgress = flashDuration / Math.max(0.01, Number(player.flashInitialDuration) || flashDuration);
    const flashOpacity = Math.min(0.3, flashStrength * 0.3) * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(flashProgress, 0, 1), 0, 1);
    const health = Math.max(0, Number(player.health) || 0);
    const reload = demoPlayerReload(demoRosterRuntime.reloads, player, tick);
    const playerId = String(player.steamid || player.name);
    const canSelectPov = health > 0 && player.hasPosition !== false;
    return <div className={`roster-player${health > 0 ? '' : ' dead'}${selectedPovId === playerId ? ' pov-selected' : ''}`} key={playerId} role="button" tabIndex={canSelectPov ? 0 : -1} onClick={(event) => { event.currentTarget.blur(); if (canSelectPov) selectPov?.(player); }} onKeyDown={(event) => { if (canSelectPov && event.key === 'Enter') { event.preventDefault(); selectPov?.(player); } }}>
      <div className="roster-health-track"><i style={{ width: `${delayedHealth}%` }} /><span style={{ width: `${health}%` }} /></div>
      <strong>{player.name}</strong><b>{health} HP</b>
      <div className="roster-equipment"><span className="roster-armor">{player.armor > 0 && <><RosterIcon type={player.hasHelmet ? 'armorHelmet' : 'armor'} /><i>{player.armor}</i></>}</span>{player.hasDefuser && <RosterIcon type="defuser" />}</div>
      <div className="roster-money"><span>${Math.max(0, Number(player.balance) || 0)}</span>{moneyDelta !== 0 && <i key={moneyKey} className={moneyDelta > 0 ? 'gain' : 'spend'}>{moneyDelta > 0 ? '+' : ''}{moneyDelta}$</i>}</div>
      <small>{playerGrenadeIcons(player.inventory, noGrenadesLabel, player.hasC4)}</small><em><RosterWeaponIcon weapon={player.activeWeapon} side={player.side} />{player.activeWeaponAmmo != null && <span className="roster-ammo">{player.activeWeaponAmmo}</span>}</em>
      {reload && <span className="roster-reload" style={{ '--reload-progress': `${reload.progress * 100}%` }}><i />RELOAD</span>}
      {flashOpacity > 0 && <span className="roster-flash" style={{ opacity: flashOpacity }} />}
    </div>;
  })}</div>;
}

export function DemoPovHud({ player, firing, hurt, minimal = false }) {
  if (!player) return null;
  const weapon = String(player.activeWeapon || '-').replace(/^weapon_/, '').toUpperCase();
  const weaponKind = demoWeaponKind(player.activeWeapon);
  const flashDuration = Math.max(0, Number(player.flashDuration) || 0);
  const flashProgress = flashDuration / Math.max(0.01, Number(player.flashInitialDuration) || flashDuration);
  const flashStrength = Number(player.flashMaxAlpha) > 0 ? THREE.MathUtils.clamp(Number(player.flashMaxAlpha) / 255, 0, 1) : flashDuration > 0 ? 1 : 0;
  const flashOpacity = flashStrength * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(flashProgress, 0, 1), 0, 1);
  return <div className={`demo-pov-hud pov-kind-${weaponKind}${firing ? ' firing' : ''}${player.scoped ? ' scoped' : ''}`}>
    <div className="demo-pov-crosshair" aria-hidden="true"><i /><i /></div>
    {!minimal && <div className="demo-pov-weapon"><small>POV · {player.name}</small><div><KillIcon type="weapon" weapon={player.activeWeapon} side={player.side} /><strong>{weapon}</strong>{player.activeWeaponAmmo != null && <b>{player.activeWeaponAmmo}</b>}</div></div>}
    {hurt && <div className="demo-pov-hurt" />}
    {flashOpacity > 0 && <div className="demo-pov-flash" style={{ opacity: flashOpacity }} />}
  </div>;
}

export function DemoMonitorWall({ players, primaryId, onSelect, translate }) {
  const primary = players.find((player) => player.monitorId === primaryId) || null;
  const others = sameTeamMonitorPlayers(players, primaryId);
  const dead = primary && Number(primary.health) <= 0;
  const wallRef = useRef(null);
  useLayoutEffect(() => {
    const stage = wallRef.current?.closest('.board-stage');
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const resize = () => {
      if (stage.closest('.board-shell')?.classList.contains('is-mobile')) {
        stage.style.removeProperty('--monitor-wall-width');
        return;
      }
      const slots = Math.max(others.length, 1);
      // Match the actual row height after wall margins, padding and gaps.
      const tileHeight = (stage.clientHeight - 58 - 12 - 12 - 2 - 5 * (slots - 1)) / slots;
      const centerWidth = stage.querySelector('.three-board')?.clientWidth || stage.clientWidth;
      const width = Math.max(160, Math.min(390, centerWidth * 0.42, tileHeight * 16 / 9 + 12));
      stage.style.setProperty('--monitor-wall-width', `${Math.round(width)}px`);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => { observer.disconnect(); stage.style.removeProperty('--monitor-wall-width'); };
  }, [others.length]);
  return <>
    {dead && <div className="demo-monitor-main-dead" aria-label={`${primary.name} ${translate('killed')}`}><i /><strong>{primary.name}</strong></div>}
    <aside className="demo-monitor-wall" ref={wallRef} style={{ '--monitor-slot-count': Math.max(others.length, 1) }} aria-label={translate('cameraMonitor')}>
      <div className="demo-monitor-grid">{others.map((player) => {
        const playerDead = Number(player.health) <= 0;
        const unavailable = !playerDead && player.hasPosition === false;
        return <button type="button" className={`demo-monitor-tile side-${Number(player.team) === 2 ? 't' : 'ct'}${playerDead ? ' dead' : ''}${unavailable ? ' unavailable' : ''}`} data-monitor-player-id={player.monitorId} key={player.monitorId} onClick={() => onSelect(player)}>
          <span>{player.name}</span><b>{playerDead ? 'DEAD' : unavailable ? translate('monitorNoData') : `${Math.max(0, Number(player.health) || 0)} HP`}</b>
          {!playerDead && !unavailable && <i className="demo-monitor-crosshair" aria-hidden="true" />}
          {playerDead && <i aria-hidden="true" />}
        </button>;
      })}</div>
    </aside>
  </>;
}

export function DemoMonitorTeamSwitch({ players, primaryId, onSelect }) {
  const primary = players.find((player) => player.monitorId === primaryId);
  return <div className="demo-monitor-team-switch">{[[2, 'T'], [3, 'CT']].map(([team, label]) => {
    const target = monitorTeamPrimary(players, team);
    return <button type="button" key={team} className={Number(primary?.team) === team ? 'selected' : ''} disabled={!target} onClick={() => target && onSelect(target)}>{label}</button>;
  })}</div>;
}
