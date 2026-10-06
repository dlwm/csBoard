import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdownContent.css';

const plugins = [remarkGfm];
const components = {
  a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
  // Notes never load remote images or renderer-local files.
  // 更新说明不加载外部图片或本地文件；图片描述仍可阅读。
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
};
const safeUrl = value => /^https?:\/\//i.test(value) || value.startsWith('#') ? value : '';

export default function MarkdownContent({ content, language, className = '' }) {
  return <div className={`markdown-content ${className}`} lang={language === 'zh' ? 'zh-CN' : language}>
    <Markdown remarkPlugins={plugins} components={components} urlTransform={safeUrl} skipHtml>{String(content || '')}</Markdown>
  </div>;
}
