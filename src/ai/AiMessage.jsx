import { Fragment } from 'react';

// Render a small Markdown subset as React text, never as provider-supplied HTML.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>);
}
export default function AiMessage({ content }) {
  const blocks = []; let code = null; let list = null;
  const flushList = () => { if (list) { blocks.push(list.ordered ? <ol key={blocks.length}>{list.items}</ol> : <ul key={blocks.length}>{list.items}</ul>); list = null; } };
  for (const line of content.split('\n')) {
    if (line.startsWith('```')) {
      flushList();
      if (code !== null) { blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>); code = null; } else code = [];
      continue;
    }
    if (code !== null) { code.push(line); continue; }
    const item = line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
    if (item) {
      const ordered = !item[1];
      if (list && list.ordered !== ordered) flushList();
      list ||= { ordered, items: [] };
      list.items.push(<li key={list.items.length}>{inline(item[2])}</li>);
      continue;
    }
    flushList();
    if (/^#{1,6}\s/.test(line)) blocks.push(<h4 key={blocks.length}>{inline(line.replace(/^#{1,6}\s+/, ''))}</h4>);
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flushList();
  if (code !== null) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
  return <div className="ai-markdown">{blocks}</div>;
}
