import { localize } from '../i18n.js';
import { useDesktopFontScale } from './useDesktopFontScale.js';

export default function DesktopAppearance({ language }) {
  const [fontScale, setFontScale] = useDesktopFontScale();
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <section className="desktop-appearance"><h3>{text('界面字号', 'Interface text size', 'Размер текста интерфейса')}</h3>
    <p>{text('即时调整文字大小，设置自动保存。', 'Adjust text size immediately. Changes are saved automatically.', 'Размер текста меняется сразу и сохраняется автоматически.')}</p>
    <label>{text('字号比例', 'Text scale', 'Масштаб текста')}<input type="range" min="80" max="150" step="5" value={fontScale} onChange={event => setFontScale(event.target.value)} /><output>{fontScale}%</output></label>
    <div className="desktop-manager-actions"><button onClick={() => setFontScale(100)}>{text('恢复默认', 'Reset to default', 'По умолчанию')}</button></div>
  </section>;
}
