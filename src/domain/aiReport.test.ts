import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAiReport } from './aiReport';
import { createEmptyDay } from './day';
import { ACTIVITIES } from '../activities';
import type { Settings } from '../types';

const day = createEmptyDay('2026-09-23T08:00:00.000Z', ACTIVITIES);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateAiReport', () => {
  it('throws if no provider/key is configured', async () => {
    const settings: Settings = { recoveryCode: 'X', llmProvider: null, llmApiKey: null, customActivities: [] };
    await expect(generateAiReport(day, settings, ACTIVITIES)).rejects.toThrow('No LLM provider configured');
  });

  it('calls the Anthropic messages API and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'A very funny anthropic report.' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const settings: Settings = { recoveryCode: 'X', llmProvider: 'anthropic', llmApiKey: 'sk-ant-test', customActivities: [] };

    const result = await generateAiReport(day, settings, ACTIVITIES);

    expect(result).toBe('A very funny anthropic report.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
  });

  it('calls the OpenAI chat completions API and returns the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'A very funny openai report.' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const settings: Settings = { recoveryCode: 'X', llmProvider: 'openai', llmApiKey: 'sk-openai-test', customActivities: [] };

    const result = await generateAiReport(day, settings, ACTIVITIES);

    expect(result).toBe('A very funny openai report.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-openai-test');
  });

  it('throws a descriptive error when the API responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const settings: Settings = { recoveryCode: 'X', llmProvider: 'anthropic', llmApiKey: 'bad-key', customActivities: [] };

    await expect(generateAiReport(day, settings, ACTIVITIES)).rejects.toThrow('Anthropic API error: 401');
  });
});
