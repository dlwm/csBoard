// Replay coordinates and observer cameras belong to their source map. Keep
// the saved replay intact while another map is being inspected.
// 回放坐标与相机只属于来源地图；浏览其他地图时隔离场景输入，保留回放记录。
export function replaySceneInputs(props) {
  if (!props.demoMapName || props.demoMapName === props.mapName) return props;
  return {
    ...props,
    demoSnapshot: null,
    demoSnapshots: [],
    demoTick: 0,
    demoFires: [],
    demoHurts: [],
    demoGrenades: [],
    demoProjectiles: [],
    demoSmokeVoxelFrames: [],
    demoInfernoFrames: [],
    demoGrenadeSegments: [],
    demoDeaths: [],
    demoC4Events: [],
    demoHltvEvents: [],
    demoCameraMode: 'manual',
    demoMonitorPlayers: [],
    demoInEyePlayer: null,
    utilityFirstPerson: null,
    utilityProjectileFollow: null,
  };
}
