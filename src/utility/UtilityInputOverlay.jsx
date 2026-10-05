import { useMemo } from 'react';
import { localize } from '../i18n.js';
import { utilityReplayInput, utilityReplayInputMode } from './replayInput.js';

const keys = [
  ['FORWARD', '↑', { zh: '前进', en: 'Forward', ru: 'Вперёд' }],
  ['LEFT', '←', { zh: '左移', en: 'Left', ru: 'Влево' }],
  ['BACK', '↓', { zh: '后退', en: 'Back', ru: 'Назад' }],
  ['RIGHT', '→', { zh: '右移', en: 'Right', ru: 'Вправо' }],
];

export default function UtilityInputOverlay({ playback, language }) {
  const replay = playback?.note.replay;
  const input = utilityReplayInput(replay, playback?.tick, playback?.note.behavior);
  const mode = useMemo(() => utilityReplayInputMode(replay, playback?.note.behavior), [replay, playback?.note.behavior]);
  const pressed = localize(language, { zh: '按下', en: 'Pressed', ru: 'Нажата' });
  const released = localize(language, { zh: '松开', en: 'Released', ru: 'Отпущена' });
  const title = localize(language, { zh: '回放按键', en: 'Replay inputs', ru: 'Клавиши повтора' });
  return <div className="utility-input-overlay" role="group" aria-label={title}>
    <div className="utility-input-devices">
      <div className="utility-input-keyboard">
        {keys.map(([action, arrow, label]) => {
          const active = input.movement.includes(action);
          return <span key={action} className={`utility-input-key key-${action.toLowerCase()}${active ? ' pressed' : input.recentMovement.includes(action) ? ' triggered' : ''}`} aria-label={`${localize(language, label)}: ${active ? pressed : released}`}><span aria-hidden="true">{arrow}</span></span>;
        })}
        <span className={`utility-input-key key-space${input.jump ? ' pressed' : input.recentJump ? ' triggered' : ''}`} aria-label={`${localize(language, { zh: '跳跃', en: 'Jump', ru: 'Прыжок' })}: ${input.jump ? pressed : released}`} title={input.jumpMode === 'observed' ? localize(language, { zh: '根据向上离地动作还原，不代表真实空格按键。', en: 'Reconstructed from upward takeoff, not a recorded Space key.', ru: 'Восстановлено по отрыву вверх, а не по записи клавиши пробела.' }) : undefined}><span aria-hidden="true">{localize(language, { zh: '空格', en: 'Space', ru: 'Пробел' })}</span></span>
      </div>
      <svg className="utility-input-mouse" viewBox="0 0 72 100" role="img" aria-label={localize(language, { zh: `鼠标左键：${input.primary ? pressed : released}；右键：${input.secondary ? pressed : released}`, en: `Left mouse: ${input.primary ? pressed : released}; right mouse: ${input.secondary ? pressed : released}`, ru: `Левая кнопка: ${input.primary ? pressed : released}; правая: ${input.secondary ? pressed : released}` })}>
        <path className="mouse-cable" d="M36 5V0" />
        <path className="mouse-body" d="M36 6C15 6 7 20 7 41v20c0 22 11 33 29 33s29-11 29-33V41C65 20 57 6 36 6Z" />
        <path className={`mouse-button${input.primary ? ' pressed' : input.recentPrimary ? ' triggered' : ''}`} d="M32 10C18 11 11 23 11 41v4h21Z" />
        <path className={`mouse-button${input.secondary ? ' pressed' : input.recentSecondary ? ' triggered' : ''}`} d="M40 10c14 1 21 13 21 31v4H40Z" />
        <path className="mouse-seam" d="M36 10v40M11 49h50" />
        <rect className="mouse-wheel" x="33" y="23" width="6" height="16" rx="3" />
        <text x="21" y="36" aria-hidden="true">L</text><text x="51" y="36" aria-hidden="true">R</text>
      </svg>
    </div>
    <span className="utility-input-caption" title={mode === 'observed' ? localize(language, { zh: '根据记录的位移、视线与道具状态还原动作，不代表真实键盘鼠标输入。', en: 'Reconstructed from recorded motion, aim and grenade state; these are not actual keyboard/mouse inputs.', ru: 'Восстановлено по движению, прицелу и состоянию гранаты; это не запись нажатий.' }) : undefined}>{playback && mode === 'unavailable' ? localize(language, { zh: '该速记无按键记录', en: 'No recorded inputs in this note', ru: 'В заметке нет записи клавиш' }) : mode === 'observed' ? localize(language, { zh: '按动作还原', en: 'Reconstructed actions', ru: 'Восстановленные действия' }) : title}</span>
  </div>;
}
