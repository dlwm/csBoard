import { modelObjectsFromGltf, modelObjectSignature } from '../../shared/map-model-objects.js';

export function bindMapObjectVisibility(gltf) {
  const signature = modelObjectSignature(modelObjectsFromGltf(gltf.parser.json));
  const nodes = [];
  gltf.scene.traverse(object => {
    const index = gltf.parser.associations.get(object)?.nodes;
    if (Number.isInteger(index) && Number.isInteger(gltf.parser.json.nodes[index]?.mesh)) nodes.push({ object, index, visible: object.visible });
  });
  gltf.scene.userData.applyObjectVisibility = record => {
    const hidden = new Set(record.signature === signature ? record.hidden : []);
    for (const node of nodes) node.object.visible = node.visible && !hidden.has(node.index);
  };
}
