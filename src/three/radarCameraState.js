// Creates the serializable camera/player snapshot consumed by the 2D radar overlay.
export default function buildRadarCameraState({ camera, controls, snapshot, collabPoints, modelCenter, sourceBounds }) {
  const demoPlayers = (snapshot?.players || []).filter((player) => player.health > 0).map((player) => {
    const yaw = (Number(player.yaw) || 0) * Math.PI / 180;
    const position = [player.position.x - modelCenter.x, player.position.y - modelCenter.y, player.position.z - modelCenter.z];
    return {
      id: String(player.steamid || player.name),
      name: player.name,
      team: player.team === 2 ? 'T' : 'CT',
      position,
      target: [position[0] + Math.sin(yaw), position[1], position[2] + Math.cos(yaw)],
      source: 'demo',
    };
  });
  const collabPlayers = collabPoints.filter((point) => point.userData.collabPlayer).map((point) => ({
    id: point.userData.pointId,
    name: point.userData.playerName,
    team: point.userData.team || 'T',
    position: point.position.toArray(),
    target: [point.position.x - Math.sin(point.rotation.y), point.position.y, point.position.z - Math.cos(point.rotation.y)],
    source: 'collab',
  }));
  return {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    players: [...demoPlayers, ...collabPlayers],
    bounds: {
      minX: sourceBounds.minX - modelCenter.x,
      maxX: sourceBounds.maxX - modelCenter.x,
      minZ: sourceBounds.minZ - modelCenter.z,
      maxZ: sourceBounds.maxZ - modelCenter.z,
    },
  };
}
