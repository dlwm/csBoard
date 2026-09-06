// Touch-friendly radial picker for camera presets and reset.
import { useEffect, useState } from 'react';
import { localize } from '../i18n.js';

export default function MobileCameraWheel({ slots, active, onRestore, onSave, onReset, language }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const [gesture, setGesture] = useState(null);
  const [saving, setSaving] = useState(null);
  const items = [{ id: 'reset', label: 'R', reset: true }, ...slots.map((saved, index) => ({ id: index, label: index === 9 ? '0' : index + 1, saved }))];
  const count = items.length;
  const wrap = (value) => ((value % count) + count) % count;
  const [position, setPosition] = useState(active == null ? 0 : Number(active) + 1);
  useEffect(() => { if (active != null) setPosition(Number(active) + 1); }, [active]);
  const activate = (index) => {
    const item = items[wrap(index)];
    setPosition(wrap(index));
    if (item.reset) onReset();
    else if (item.saved) onRestore(item.id);
  };
  const finish = (event) => {
    const start = gesture;
    setGesture(null);
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const centeredIndex = wrap(Math.round(wrap(start.position - deltaX / 38)));
    const tappedIndex = Number(event.target.closest?.('[data-camera-index]')?.dataset.cameraIndex);
    const targetIndex = Math.abs(deltaX) > 8 ? centeredIndex : Number.isFinite(tappedIndex) ? tappedIndex : centeredIndex;
    const centeredItem = items[centeredIndex];
    if (-deltaY > 34 && Math.abs(deltaY) > Math.abs(deltaX) && !centeredItem.reset) {
      setPosition(centeredIndex);
      onSave(centeredItem.id);
      setSaving(centeredItem.id);
      window.setTimeout(() => setSaving((current) => current === centeredItem.id ? null : current), 520);
    } else activate(targetIndex);
  };
  return <div className="mobile-camera-wheel" aria-label={text('机位轮盘', 'Camera wheel', 'Колесо камер')}>
    <span>{text('左右转动 · 上滑保存', 'Rotate · Swipe up to save', 'Вращайте · Смахните вверх для сохранения')}</span>
    <div className={`mobile-camera-arc${gesture ? ' dragging' : ''}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setGesture({ x: event.clientX, y: event.clientY, position }); }} onPointerMove={(event) => { if (!gesture) return; setPosition(wrap(gesture.position - (event.clientX - gesture.x) / 38)); }} onPointerUp={finish} onPointerCancel={() => { setGesture(null); setPosition(wrap(Math.round(position))); }}>
      {items.map((item, index) => {
        let distance = index - position;
        if (distance > count / 2) distance -= count;
        if (distance < -count / 2) distance += count;
        const angle = distance * 19;
        const visible = Math.abs(distance) <= 4.6;
        return <button type="button" key={item.id} data-camera-index={index} tabIndex={Math.abs(distance) < 0.5 ? 0 : -1} className={`${item.reset ? 'reset ' : ''}${Math.abs(distance) < 0.5 ? 'active ' : ''}${item.saved ? 'saved ' : ''}${saving === item.id ? 'saving' : ''}`} style={{ '--camera-angle': `${angle}deg`, '--camera-counter-angle': `${-angle}deg`, opacity: visible ? Math.max(0.18, 1 - Math.abs(distance) * 0.16) : 0, pointerEvents: visible ? 'auto' : 'none' }} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); activate(index); }}><b>{item.reset ? text('重置', 'Reset', 'Сброс') : item.label}</b><i /></button>;
      })}
    </div>
  </div>;
}
