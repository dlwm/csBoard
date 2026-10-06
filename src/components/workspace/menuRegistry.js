// One declaration controls navigation, platform availability and workspace chrome.
// 新菜单先在此注册名称、能力与布局；栏内内容仍通过 WorkspaceContribution 注入。
export const WORKSPACE_MENUS = Object.freeze([
  { id: 'demo', label: 'rounds', requires: ['demoParsing'], session: 'demo', left: 'none', right: false, radar: 'demo' },
  { id: 'analysis', label: 'analysis', requires: ['demoParsing'], session: 'demo', left: 'utilities', right: true, radar: null },
  { id: 'utility', label: 'utilityNotes', requires: [], session: 'preserve', left: 'always', right: false, radar: 'utility' },
  { id: 'collab', label: 'collab', requires: [], session: 'preserve', left: 'frame', right: true, radar: 'collab' },
].map(menu => Object.freeze({ ...menu, requires: Object.freeze(menu.requires) })));

export function workspaceMenu(id) {
  const menu = WORKSPACE_MENUS.find(menu => menu.id === id);
  if (!menu) throw new Error(`Unknown workspace menu: ${id}`);
  return menu;
}
export const availableWorkspaceMenus = capabilities => WORKSPACE_MENUS.filter(menu => menu.requires.every(key => capabilities[key]));
export function workspaceMenuLayout(id, { utilityMetric = false, hasFrame = false, utilityPlaying = false } = {}) {
  const menu = workspaceMenu(id);
  return { hasLeft: menu.left === 'always' || (menu.left === 'utilities' && utilityMetric) || (menu.left === 'frame' && hasFrame),
    hasRight: menu.right, radar: menu.radar === 'utility' ? utilityPlaying ? 'demo' : null : menu.radar };
}
