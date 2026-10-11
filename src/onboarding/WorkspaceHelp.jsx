import { useId, useState } from 'react';
import { localize } from '../i18n.js';
import { WorkspaceContribution } from '../components/workspace/WorkspaceSlots.jsx';
import './operationGuide.css';

export default function WorkspaceHelp({ language, mobile, onTutorial, children }) {
  const id = useId(), [open, setOpen] = useState(false);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <WorkspaceContribution slot="viewport-top-right"><div className="workspace-help" onPointerEnter={event => { if (event.pointerType !== 'touch') setOpen(true); }} onPointerLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="workspace-help-trigger" aria-label={text('查看操作并开启指引', 'Controls and operation guide', 'Управление и обучение')} aria-controls={id} aria-expanded={open} title={text('点击开始操作指引', 'Click to start the guide', 'Нажмите для обучения')} onClick={() => { setOpen(false); onTutorial(); }}>?</button>
    <section id={id} className="workspace-help-content" hidden={!open} aria-label={text('快捷操作', 'Quick controls', 'Управление')}>
      {mobile && <p>{text('单指旋转，双指平移或捏合缩放。绘制开启时，单指用于画线；连接鼠标键盘后也支持以下快捷键。', 'One finger rotates; two fingers pan or pinch to zoom. With drawing enabled, one finger draws. A connected keyboard and mouse support the shortcuts below.', 'Один палец вращает, два перемещают или меняют масштаб. В режиме рисования один палец рисует. Внешние мышь и клавиатура поддерживают команды ниже.')}</p>}
      <div className="help-shortcuts">{children}</div>
      <button type="button" onClick={() => { setOpen(false); onTutorial(); }}>{text('重新开始操作指引', 'Restart operation guide', 'Начать обучение заново')}</button>
    </section>
  </div></WorkspaceContribution>;
}
