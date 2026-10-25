import { useEffect, useId, useRef, useState } from 'react';
import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import useAnchoredMenuPosition from './workspace/useAnchoredMenuPosition.js';
import './modelViewPicker.css';

// Native top-layer positioning escapes footer clipping and keeps theme ancestry.
// 复用回合菜单的顶层浮层：不受底栏滚动裁切，仍继承工作区主题。
export default function ModelViewPicker({ value, options, onChange, label, scope }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null);
  const id = useId();
  const { menuRef, style } = useAnchoredMenuPosition(open, root, 220);
  useEffect(() => { setOpen(false); }, [scope]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    };
    const selected = menuRef.current?.querySelector('input:checked') || menuRef.current?.querySelector('input');
    selected?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [open, menuRef]);
  return <div ref={root} className={`mode-picker model-view-picker${open ? ' open' : ''}`}>
    <WorkspaceButton ref={trigger} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-menu`} selected={value >= 0}
      onClick={() => setOpen(current => !current)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      {options.find(option => option.value === value)?.label || label}
    </WorkspaceButton>
    {open && <div id={`${id}-menu`} ref={menuRef} className="mode-list model-view-picker-list" popover="manual" style={style} role="dialog" aria-label={label}>
      <div role="radiogroup" aria-label={label}>{options.map(option => <label key={option.value} className={option.value === value ? 'active' : ''}>
        <input type="radio" name={id} value={option.value} checked={option.value === value}
          onChange={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }} /><span>{option.label}</span>
      </label>)}</div>
    </div>}
  </div>;
}
