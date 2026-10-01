import systemTemplate from '../../docs/ai/prompts/system.en.md?raw';
import compressionTemplate from '../../docs/ai/prompts/compression.en.md?raw';

// Prompt content and bilingual maintenance comments live in docs/ai/prompts.
// Strip maintainer comments before sending templates to the model.
const clean = template => template.replace(/<!--[\s\S]*?-->/g, '').trim();
export const compressionSystemPrompt = clean(compressionTemplate);
export function tacticalSystemPrompt(language) {
  return clean(systemTemplate).replaceAll('{{language}}', language);
}
