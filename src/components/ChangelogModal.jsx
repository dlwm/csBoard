import { useEffect } from 'react';
import changelogEn from '../../CHANGELOG.md?raw';
import changelogRu from '../../docs/CHANGELOG.ru-RU.md?raw';
import changelogZh from '../../docs/CHANGELOG.zh-CN.md?raw';
import { localize } from '../i18n.js';

const inlineTokenPattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;

function renderInline(text) {
  return text.split(inlineTokenPattern).filter(Boolean).map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index}>{token.slice(1, -1)}</code>;
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>;
    return token;
  });
}

// Changelog files use a deliberately small Markdown subset. Rendering it here
// keeps the version dialog offline and avoids shipping a general Markdown parser.
function renderChangelog(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line || /^#\s+/.test(line) || /^(?:\[[^\]]+\]\([^)]+\)(?:\s*·\s*)?)+$/.test(line)) { index += 1; continue; }
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      const Tag = heading[1].length === 2 ? 'h2' : heading[1].length === 3 ? 'h3' : 'h4';
      blocks.push(<Tag key={`heading-${index}`}>{renderInline(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(<li key={index}>{renderInline(lines[index].trim().slice(2))}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }
    const paragraph = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current || /^#{2,4}\s/.test(current) || current.startsWith('- ')) break;
      paragraph.push(current);
      index += 1;
    }
    if (paragraph.length) blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(' '))}</p>);
    else index += 1;
  }
  return blocks;
}

export default function ChangelogModal({ buildVersion, language, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const title = localize(language, { zh: '更新日志', en: 'Changelog', ru: 'Список изменений' });
  const closeLabel = localize(language, { zh: '关闭更新日志', en: 'Close changelog', ru: 'Закрыть список изменений' });
  const licenseLabel = localize(language, { zh: 'GNU GPL v3.0 许可证', en: 'GNU GPL v3.0 License', ru: 'Лицензия GNU GPL v3.0' });
  return <div className="changelog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="changelog-dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <header><div><span>{buildVersion}</span><h2 id="changelog-title">{title}</h2></div><button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>×</button></header>
      <div className="changelog-content">{renderChangelog(language === 'zh' ? changelogZh : language === 'ru' ? changelogRu : changelogEn)}</div>
      <footer>Copyright © 2026 Colvin Chen · <a href="./LICENSE" target="_blank" rel="noreferrer">{licenseLabel}</a></footer>
    </article>
  </div>;
}
