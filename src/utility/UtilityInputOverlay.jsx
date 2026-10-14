import { useMemo } from 'react';
import { translate } from '../i18n.js';
import { utilityReplayInput, utilityReplayInputMode } from './replayInput.js';

const keys = [
  ['FORWARD', '↑', "utility.utilityInputOverlay.forward"],
  ['LEFT', '←', "utility.utilityInputOverlay.left"],
  ['BACK', '↓', "utility.utilityInputOverlay.back"],
  ['RIGHT', '→', "utility.utilityInputOverlay.right"],
];

export default function UtilityInputOverlay({ playback, language }) {
  const replay = playback?.note.replay;
  const input = utilityReplayInput(replay, playback?.tick, playback?.note.behavior);
  const mode = useMemo(() => utilityReplayInputMode(replay, playback?.note.behavior), [replay, playback?.note.behavior]);
  const pressed = translate(language, "utility.utilityInputOverlay.pressed");
  const released = translate(language, "utility.utilityInputOverlay.released");
  const title = translate(language, "utility.utilityInputOverlay.replayInputs");
  return <div className="utility-input-overlay" role="group" aria-label={title}>
    <div className="utility-input-devices">
      <div className="utility-input-keyboard">
        {keys.map(([action, arrow, label]) => {
          const active = input.movement.includes(action);
          return <span key={action} className={`utility-input-key key-${action.toLowerCase()}${active ? ' pressed' : input.recentMovement.includes(action) ? ' triggered' : ''}`} aria-label={`${translate(language, label)}: ${active ? pressed : released}`}><span aria-hidden="true">{arrow}</span></span>;
        })}
        <span className={`utility-input-key key-space${input.jump ? ' pressed' : input.recentJump ? ' triggered' : ''}`} aria-label={`${translate(language, "utility.utilityInputOverlay.jump")}: ${input.jump ? pressed : released}`} title={input.jumpMode === 'observed' ? translate(language, "utility.utilityInputOverlay.reconstructedFromUpwardTakeoffNotARecordedSpaceKey") : undefined}><span aria-hidden="true">{translate(language, "utility.utilityInputOverlay.space")}</span></span>
      </div>
      <svg className="utility-input-mouse" viewBox="0 0 72 100" role="img" aria-label={translate(language, { key: "utility.utilityInputOverlay.leftMouseRightMouse", values: { value1: input.primary ? pressed : released, value2: input.secondary ? pressed : released } })}>
        <path className="mouse-cable" d="M36 5V0" />
        <path className="mouse-body" d="M36 6C15 6 7 20 7 41v20c0 22 11 33 29 33s29-11 29-33V41C65 20 57 6 36 6Z" />
        <path className={`mouse-button${input.primary ? ' pressed' : input.recentPrimary ? ' triggered' : ''}`} d="M32 10C18 11 11 23 11 41v4h21Z" />
        <path className={`mouse-button${input.secondary ? ' pressed' : input.recentSecondary ? ' triggered' : ''}`} d="M40 10c14 1 21 13 21 31v4H40Z" />
        <path className="mouse-seam" d="M36 10v40M11 49h50" />
        <rect className="mouse-wheel" x="33" y="23" width="6" height="16" rx="3" />
        <text x="21" y="36" aria-hidden="true">L</text><text x="51" y="36" aria-hidden="true">R</text>
      </svg>
    </div>
    <span className="utility-input-caption" title={mode === 'observed' ? translate(language, "utility.utilityInputOverlay.reconstructedFromRecordedMotionAimAndGrenadeStateTheseAre") : undefined}>{playback && mode === 'unavailable' ? translate(language, "utility.utilityInputOverlay.noRecordedInputsInThisNote") : mode === 'observed' ? translate(language, "utility.utilityInputOverlay.reconstructedActions") : title}</span>
  </div>;
}
