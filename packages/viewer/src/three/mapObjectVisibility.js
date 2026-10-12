import { modelObjectsFromGltf, modelObjectSignature, buildModelObjectTree } from '../data/mapModelObjects.js';
import { ViewerError } from '../core/controller.js';

export function bindMapObjectVisibility(gltf) {
  const objects = modelObjectsFromGltf(gltf.parser.json), signature = modelObjectSignature(objects);
  const ids = new Set(objects.map(object => object.id)), nodes = [];
  let hidden = new Set();
  gltf.scene.traverse(object => {
    const index = gltf.parser.associations.get(object)?.nodes;
    if (Number.isInteger(index) && Number.isInteger(gltf.parser.json.nodes[index]?.mesh)) nodes.push({ object, index, visible: object.visible });
  });
  const refresh = () => { for (const node of nodes) node.object.visible = node.visible && !hidden.has(node.index); };
  const apply = record => { hidden = new Set(record?.signature === signature && Array.isArray(record.hidden) ? record.hidden.filter(id => ids.has(id)) : []); refresh(); };
  gltf.scene.userData.applyObjectVisibility = apply;
  return Object.freeze({
    signature,
    getCatalogue({ query = '', offset = 0, limit = 100 } = {}) {
      if (typeof query !== 'string' || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new ViewerError('invalid_query', 'Object query requires text, offset>=0 and limit 1–1000');
      const found = objects.filter(object => object.name.toLowerCase().includes(query.trim().toLowerCase()));
      return { signature, total: found.length, offset, objects: found.slice(offset, offset + limit).map(object => ({ ...object, visible: !hidden.has(object.id) })) };
    },
    getTree(query = '') { if (typeof query !== 'string') throw new ViewerError('invalid_query', 'Tree query must be text'); return { signature, tree: structuredClone(buildModelObjectTree(objects, query)) }; },
    getRecord: () => ({ signature, hidden: [...hidden] }),
    setVisible(selected, visible, expectedSignature) {
      if (expectedSignature !== signature) throw new ViewerError('object_catalog_changed', 'Model object signature changed; reread the catalogue');
      if (!Array.isArray(selected) || selected.length > objects.length || selected.some(id => !Number.isInteger(id) || !ids.has(id)) || typeof visible !== 'boolean') throw new ViewerError('invalid_argument', 'Object visibility requires valid node IDs and a boolean');
      for (const id of selected) { if (visible) hidden.delete(id); else hidden.add(id); } refresh();
    },
    apply,
  });
}
