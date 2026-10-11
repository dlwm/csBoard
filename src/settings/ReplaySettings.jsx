import { useId } from 'react';
import { localize } from '../i18n.js';
import { DEMO_SAMPLE_RATES } from '../demo/sampling.js';
export function ModelQualitySettings({ language, value, onChange }) {
  const id=useId();
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <>
    <p>{text('按视角自动应用面简化。0 保留原模型，数值越大越简约；原始碰撞保持不变。', 'Surface simplification is applied automatically per view. Zero preserves the original; higher values simplify more. Collision geometry is unchanged.', 'Упрощение применяется автоматически для каждого вида. Ноль сохраняет оригинал; большие значения сильнее упрощают. Коллизии не меняются.')}</p>
    {[
      ['monitor', text('当监视器时', 'Monitor views', 'В режиме мониторов')],
      ['firstPerson', text('当第一人称时', 'First-person view', 'От первого лица')],
      ['free', text('当自由视角时', 'Free camera', 'Свободная камера')],
    ].map(([key, label]) => <div key={key} className="settings-range settings-quality-range"><label htmlFor={`${id}-${key}`}>{label}</label><div className="settings-range-track"><input id={`${id}-${key}`} type="range" min="0" max="100" step="1" value={value[key]} style={{'--range-fill':`${value[key]}%`}} onChange={event => onChange({ [key]: Number(event.target.value) })} /><i className="settings-range-recommended" aria-hidden="true" /></div><output htmlFor={`${id}-${key}`}>{value[key]}</output><button type="button" className="settings-recommendation" onClick={()=>onChange({[key]:60})}>{text('推荐 60','Suggested 60','Рекомендуется 60')}</button></div>)}
    <small>{text('实验性。首次应用需要计算；保持建筑边界，实际面数受误差约束。', 'Experimental. The first application needs computation; building borders and error limits constrain reduction.', 'Экспериментально. Первое применение требует вычисления; границы зданий и допустимая ошибка ограничивают упрощение.')}</small>
    <div className="desktop-manager-actions"><button onClick={() => onChange({ monitor: 0, firstPerson: 0, free: 0 })}>{text('恢复原模型', 'Use original geometry', 'Исходная геометрия')}</button></div>
  </>;
}
export function ParsingSettings({ language, value, onChange }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <>
    <label className="settings-range"><span>{text('Tick 采样', 'Tick sampling', 'Выборка тиков')}</span><select value={value} onChange={event => onChange(Number(event.target.value))}>{DEMO_SAMPLE_RATES.map(rate => <option key={rate} value={rate}>{rate} / s</option>)}</select></label>
    <p>{text(`每 ${64 / value} tick 记录一次主回放。仅影响后续解析，已有数据不变。`, `One replay sample every ${64 / value} ticks. Applies to future parsing; existing data is unchanged.`, `Один сэмпл каждые ${64 / value} тиков. Применяется к будущему разбору; готовые данные не меняются.`)}</p>
    {value >= 16 && <small>{text('高采样率会增加解析时间、内存和存储占用。', 'Higher sampling rates increase processing time, memory and storage use.', 'Высокая частота увеличивает время разбора, расход памяти и объём хранения.')}</small>}
  </>;
}
