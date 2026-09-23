import type { ActivityConfig, Day, Settings } from '../types';
import { buildStatsSummary, STYLE_INSTRUCTION } from './reportText';

async function callAnthropic(apiKey: string, statsSummary: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: `${STYLE_INSTRUCTION}\n\n${statsSummary}` }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text as string;
}

async function callOpenAi(apiKey: string, statsSummary: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `${STYLE_INSTRUCTION}\n\n${statsSummary}` }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content as string;
}

export async function generateAiReport(day: Day, settings: Settings, activities: ActivityConfig[]): Promise<string> {
  if (!settings.llmProvider || !settings.llmApiKey) {
    throw new Error('No LLM provider configured');
  }
  const statsSummary = buildStatsSummary(day, activities);
  return settings.llmProvider === 'anthropic'
    ? callAnthropic(settings.llmApiKey, statsSummary)
    : callOpenAi(settings.llmApiKey, statsSummary);
}
