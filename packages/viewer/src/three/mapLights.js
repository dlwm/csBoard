// World exports can contain Source 2 lights in physical units (e.g. a 1707.5
// intensity sun). They must not illuminate the tactical scene on top of its
// own lights. Keep geometry/transforms and original materials unchanged.
// 世界导出可能带高强度游戏灯光，不能叠加到战术场景；仅移除灯光节点。
export function removeImportedMapLights(root) {
  const lights = [];
  root.traverse(object => { if (object.isLight) lights.push(object); });
  root.updateMatrixWorld(true);
  for (const light of lights) {
    const parent = light.parent;
    if (!parent) continue;
    // Preserve any geometry attached beneath a light node in custom GLBs.
    // 自定义模型若将几何挂在灯光节点下，保留其世界变换，不连带删除。
    for (const child of [...light.children]) parent.attach(child);
    parent.remove(light);
    light.dispose?.();
  }
}
