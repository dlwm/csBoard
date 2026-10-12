// Stable GLB node IDs are shared by catalogue inspection and the live loader.
// 名称使用原始 GLB 元数据，避免 Three.js 清洗名称后 UI 与场景不一致。
export function modelObjectsFromGltf(json) {
  return (json.nodes || []).flatMap((node, index) => Number.isInteger(node.mesh)
    ? [{ id: index, name: node.name || json.meshes?.[node.mesh]?.name || `object_${index}` }] : []);
}
export function modelObjectSignature(objects) {
  let hash = 2166136261;
  for (const char of JSON.stringify(objects)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `${objects.length}-${hash.toString(16)}`;
}
// Match the rendered tree: a collapsed single-object path is a leaf;
// multi-object groups and nodes with descendants are folders.
// 与 UI 保持同一分类：压缩后的单对象为元素，多对象或含子节点的分组为文件夹。
export const isModelObjectLeaf = branch => !branch.children.length && branch.objects.length === 1;

export function buildModelObjectTree(objects, query = '') {
  const root = { label: '', children: new Map(), objects: [], ids: [] };
  const search = query.trim().toLowerCase();
  for (const object of objects) {
    if (!object.name.toLowerCase().includes(search)) continue;
    let branch = root;
    branch.ids.push(object.id);
    for (const label of object.name.split('_').filter(Boolean)) {
      if (!branch.children.has(label)) branch.children.set(label, { label, children: new Map(), objects: [], ids: [] });
      branch = branch.children.get(label);
      branch.ids.push(object.id);
    }
    branch.objects.push(object);
  }
  const serialize = (input, path, isRoot = false) => {
    let branch = input;
    const labels = isRoot ? [] : [branch.label];
    while (!isRoot && !branch.objects.length && branch.children.size === 1) {
      branch = branch.children.values().next().value;
      labels.push(branch.label);
    }
    const fullPath = [...path, ...labels];
    return { label: labels.join('_'), key: JSON.stringify(fullPath), ids: branch.ids,
      objects: branch.objects, children: [...branch.children.values()].map(child => serialize(child, fullPath)).sort((a, b) => Number(isModelObjectLeaf(a)) - Number(isModelObjectLeaf(b)) || a.label.localeCompare(b.label, undefined, { numeric: true })) };
  };
  return serialize(root, [], true);
}
