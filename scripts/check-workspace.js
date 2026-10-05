import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE_SLOTS } from '../src/components/workspace/slotNames.js';
import { WORKSPACE_MENUS } from '../src/components/workspace/menuRegistry.js';

const chromeRoots = ['analysis-panel', 'broadcast-panel', 'utility-notes-panel', 'collab-panel', 'utility-location-panel', 'collab-objects', 'utility-recommendations', 'board-stage', 'demo-panel', 'view-tools', 'workspace-sidebar', 'workspace-left', 'workspace-right', 'workspace-bottom-bar', 'broadcast-model-controls', 'broadcast-model-options', 'demo-toolbar', 'demo-playback-controls'];
const geometry = new Set(['position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'margin', 'padding', 'transform', 'grid-column', 'grid-row', 'grid-template-columns', 'grid-template-rows', '--left-column', '--right-column']);
const directEdits = new Set(['applyTacticalSnapshot', 'addCollabUtility', 'removeCollabUtility', 'renamePlayerPoint', 'undoCollab', 'redoCollab']);
const rootSelector = new RegExp(`\\.(?:${chromeRoots.join('|')})(?:\\[[^\\]]*\\]|:[\\w-]+\\([^)]*\\)|:[\\w-]+)*\\s*$`);

// Parse selector lists without splitting commas inside :has/:not or attributes.
function selectors(value) {
  const result = []; let depth = 0, start = 0;
  for (let index = 0; index < value.length; index++) {
    if ('(['.includes(value[index])) depth++;
    if (')]'.includes(value[index])) depth--;
    if (value[index] === ',' && depth === 0) { result.push(value.slice(start, index)); start = index + 1; }
  }
  result.push(value.slice(start)); return result;
}

export function checkWorkspaceNode(file, node, report) {
  if (node.type === 'JSXOpeningElement') {
    const name = node.name?.name;
    if (name === 'WorkspaceContribution' || name === 'WorkspaceTarget') {
      const attribute = node.attributes.find(attribute => attribute.name?.name === 'slot');
      const slot = attribute?.value?.value ?? attribute?.value?.expression?.value;
      if (typeof slot === 'string' && !WORKSPACE_SLOTS.includes(slot)) report(node, `Unknown workspace slot ${slot}; register it in slotNames.js`);
    }
    const className = node.attributes.find(attribute => attribute.name?.name === 'className')?.value?.value;
    const style = node.attributes.find(attribute => attribute.name?.name === 'style')?.value?.expression;
    if (!file.startsWith('src/components/workspace/') && className?.split(/\s+/).some(name => chromeRoots.includes(name)) && style?.type === 'ObjectExpression') {
      for (const property of style.properties) {
        const key = property.key?.name ?? property.key?.value;
        if (key && geometry.has(key.replace(/[A-Z]/g, character => '-' + character.toLowerCase()))) report(node, 'Workspace geometry belongs in the shared frame, not menu inline styles');
      }
    }
  }
  if (['CallExpression', 'OptionalCallExpression'].includes(node.type)) {
    const callee = node.callee;
    const method = callee?.property?.name;
    if (!file.startsWith('src/three/') && directEdits.has(method)) report(node, `Use workspace commands for ${method}; do not bypass editing policy`);
    if (['querySelector', 'querySelectorAll'].includes(method) && /^(src\/components\/Portals|src\/components\/workspace\/)/.test(file)) report(node, 'Workspace mounts must use registered refs, not CSS selector lookup');
  }
}

export function checkWorkspaceStyles(root) {
  const errors = [];
  function scan(folder) {
    for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const file = `${folder}/${entry.name}`;
      if (entry.isDirectory()) scan(file);
      else if (entry.name.endsWith('.css') && !file.startsWith('src/components/workspace/')) {
        // Strip comments before scanning rules; retain line positions for errors.
        const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, text => text.replace(/[^\n]/g, ' '));
        for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          if (!selectors(match[1]).some(selector => rootSelector.test(selector))) continue;
          const illegal = [...match[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map(property => property[1]).filter(property => geometry.has(property));
          if (illegal.length) errors.push(`${file}:${source.slice(0, match.index).split('\n').length}: Workspace chrome ${illegal.join(', ')} belongs in components/workspace/workspace.css`);
        }
      }
    }
  }
  scan('src');
  const ids = WORKSPACE_MENUS.map(menu => menu.id);
  if (new Set(ids).size !== ids.length || new Set(WORKSPACE_SLOTS).size !== WORKSPACE_SLOTS.length) errors.push('Duplicate workspace menu/slot');
  for (const menu of WORKSPACE_MENUS) if (!menu.label || !['none', 'always', 'utilities', 'frame'].includes(menu.left) || typeof menu.right !== 'boolean' || !['demo', 'broadcast', 'preserve'].includes(menu.session)) errors.push(`Invalid workspace menu: ${menu.id}`);
  return errors;
}
