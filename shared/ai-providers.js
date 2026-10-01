// Only Chat Completions endpoints are presets; model availability is account-specific.
export const aiProviders = [
  { id: 'openai', name: { zh: 'OpenAI', en: 'OpenAI', ru: 'OpenAI' }, baseUrl: 'https://api.openai.com/v1', docs: 'https://platform.openai.com/docs/api-reference/chat' },
  { id: 'deepseek', name: { zh: 'DeepSeek', en: 'DeepSeek', ru: 'DeepSeek' }, baseUrl: 'https://api.deepseek.com', aliases: ['https://api.deepseek.com/v1'], docs: 'https://api-docs.deepseek.com/' },
  { id: 'moonshot', name: { zh: 'Kimi / Moonshot（中国）', en: 'Kimi / Moonshot (China)', ru: 'Kimi / Moonshot (Китай)' }, baseUrl: 'https://api.moonshot.cn/v1', docs: 'https://platform.kimi.com/docs/api/overview' },
  { id: 'zhipu', name: { zh: '智谱 GLM', en: 'Zhipu GLM', ru: 'Zhipu GLM' }, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', docs: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction' },
  { id: 'siliconflow', name: { zh: '硅基流动（中国）', en: 'SiliconFlow (China)', ru: 'SiliconFlow (Китай)' }, baseUrl: 'https://api.siliconflow.cn/v1', docs: 'https://docs.siliconflow.cn/docs/userguide/quickstart' },
  { id: 'openrouter', name: { zh: 'OpenRouter', en: 'OpenRouter', ru: 'OpenRouter' }, baseUrl: 'https://openrouter.ai/api/v1', docs: 'https://openrouter.ai/docs/quickstart' },
  { id: 'dashscope', name: { zh: '阿里云百炼（北京公共接口）', en: 'Alibaba Model Studio (Beijing public endpoint)', ru: 'Alibaba Model Studio (Пекин, общий адрес)' }, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', docs: 'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope' },
];

export const defaultAiBaseUrls = [...new Set(aiProviders.flatMap(provider => [provider.baseUrl, ...(provider.aliases || [])]))];

export function completionEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    const base = url.href.replace(/\/$/, '');
    return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  } catch { return null; }
}

export function findAiProvider(endpoint) {
  const normalized = completionEndpoint(endpoint);
  return normalized ? aiProviders.find(provider => [provider.baseUrl, ...(provider.aliases || [])].some(base => completionEndpoint(base) === normalized)) || null : null;
}

export function allowedAiBaseUrls(configured) {
  const values = String(configured || '').split(',').map(value => value.trim()).filter(Boolean);
  return values.length ? values : defaultAiBaseUrls;
}
