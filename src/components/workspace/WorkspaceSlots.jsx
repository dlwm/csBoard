import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { WORKSPACE_SLOTS } from './slotNames.js';
export { WORKSPACE_SLOTS } from './slotNames.js';

const Registry = createContext(null);
const validate = slot => { if (!WORKSPACE_SLOTS.includes(slot)) throw new Error(`Unknown workspace slot: ${slot}`); };
const useRegistry = () => {
  const registry = useContext(Registry);
  if (!registry) throw new Error('Workspace slots require WorkspaceFrame');
  return registry;
};

// Targets register DOM refs; contributors keep their own React state/context.
// No global selectors or effects copying React elements into application state.
// 容器注册挂载点，业务注册内容；卸载自动撤销，不查询 DOM、不复制业务状态。
export function WorkspaceSlots({ children }) {
  const [targets, setTargets] = useState({});
  const register = useCallback((slot, node) => setTargets(current => {
    if (current[slot] === node || (!node && !current[slot])) return current;
    if (node && current[slot]) throw new Error(`Duplicate workspace target: ${slot}`);
    const next = { ...current };
    if (node) next[slot] = node; else delete next[slot];
    return next;
  }), []);
  const value = useMemo(() => ({ targets, register }), [targets, register]);
  return <Registry.Provider value={value}>{children}</Registry.Provider>;
}

export function WorkspaceTarget({ slot, className = '', ...props }) {
  validate(slot);
  const { register } = useRegistry();
  const ref = useCallback(node => register(slot, node), [register, slot]);
  return <div {...props} ref={ref} className={`workspace-slot ${className}`} data-workspace-slot={slot} />;
}

export function WorkspaceContribution({ slot, children }) {
  validate(slot);
  const { targets } = useRegistry();
  return targets[slot] ? createPortal(children, targets[slot], slot) : null;
}

export function WorkspacePanel({ className = '', children, ...props }) {
  return <section {...props} className={`workspace-panel ${className}`}>{children}</section>;
}
