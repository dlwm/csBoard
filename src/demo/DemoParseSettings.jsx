// Popover for Demo sampling and parser options.
import { useEffect, useRef, useState } from 'react';

export const DEMO_SAMPLE_RATES = [1, 2, 4, 8, 16, 32];

export default function DemoParseSettings({ value, onChange, language }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const index = Math.max(0, DEMO_SAMPLE_RATES.indexOf(value));
  const slow = value >= 16;
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeWithEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);
  return <div ref={rootRef} className={`demo-parse-settings${open ? ' open' : ''}${slow ? ' slow' : ''}`}>
    <button type="button" className="demo-parse-settings-toggle" aria-label={language === 'zh' ? '解析采样设置' : 'Parse sampling settings'} title={language === 'zh' ? '解析采样设置' : 'Parse sampling settings'} onClick={() => setOpen((current) => !current)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.7 1.5h2.6l.4 1.7c.4.1.8.3 1.2.5l1.5-.9 1.8 1.8-.9 1.5c.2.4.4.8.5 1.2l1.7.4v2.6l-1.7.4c-.1.4-.3.8-.5 1.2l.9 1.5-1.8 1.8-1.5-.9c-.4.2-.8.4-1.2.5l-.4 1.7H6.7l-.4-1.7c-.4-.1-.8-.3-1.2-.5l-1.5.9-1.8-1.8.9-1.5c-.2-.4-.4-.8-.5-1.2l-1.7-.4V7.7l1.7-.4c.1-.4.3-.8.5-1.2l-.9-1.5 1.8-1.8 1.5.9c.4-.2.8-.4 1.2-.5z" /><circle cx="8" cy="9" r="2.2" /></svg></button>
    {open && <div className="demo-parse-settings-popover"><header><span>{language === 'zh' ? '主回放每秒采样' : 'Replay samples / second'}</span><strong>{value}/s</strong></header><input type="range" min="0" max={DEMO_SAMPLE_RATES.length - 1} step="1" value={index} onChange={(event) => onChange(DEMO_SAMPLE_RATES[Number(event.target.value)])} /><div className="demo-sample-ticks">{DEMO_SAMPLE_RATES.map((rate) => <button type="button" className={rate === value ? 'active' : ''} data-slow={rate >= 16 || undefined} key={rate} onClick={() => onChange(rate)}>{rate}</button>)}</div><p className={slow ? 'warning' : ''}>{slow ? language === 'zh' ? '高采样率可能需要较长解析时间并占用更多内存。' : 'High sampling rates may take much longer and use more memory.' : language === 'zh' ? `每 ${64 / value} tick 记录一次主回放。` : `One replay sample every ${64 / value} ticks.`}</p></div>}
  </div>;
}
