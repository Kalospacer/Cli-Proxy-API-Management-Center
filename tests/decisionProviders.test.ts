import { describe, expect, test } from 'bun:test';
import {
  buildGeminiDecisionsEndpoint,
  buildOpenAIDecisionsEndpoint,
  getProviderUsageKey,
} from '../src/components/providers/utils';
import {
  decisionGeminiToResource,
  decisionOpenAIToResource,
} from '../src/features/providers/adapters';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { normalizeConfigResponse } from '../src/services/api/transformers';

describe('Decision API key providers', () => {
  test('normalizes dedicated OpenAI and Gemini decision families without mixing chat keys', () => {
    const config = normalizeConfigResponse({
      'api-keys': {
        'decision-openai': [
          {
            name: 'openai-decisions-1',
            'base-url': 'https://api.openai.com',
            keys: [
              {
                'api-key': 'sk-openai-decision',
                priority: 5,
                weight: 2,
                'auth-index': 'decision-openai:apikey:1',
              },
            ],
          },
        ],
        'decision-gemini': [
          {
            name: 'gemini-decisions-1',
            'base-url': 'https://generativelanguage.googleapis.com',
            keys: [
              {
                'api-key': 'AIza-gemini-decision',
                priority: 3,
                'excluded-models': ['*'],
                'auth-index': 'decision-gemini:apikey:1',
              },
            ],
          },
        ],
      },
    });

    expect(config.decisionOpenAIApiKeys).toMatchObject([
      {
        apiKey: 'sk-openai-decision',
        priority: 5,
        weight: 2,
        baseUrl: 'https://api.openai.com',
        authIndex: 'decision-openai:apikey:1',
      },
    ]);
    expect(config.decisionGeminiApiKeys).toMatchObject([
      {
        apiKey: 'AIza-gemini-decision',
        priority: 3,
        baseUrl: 'https://generativelanguage.googleapis.com',
        excludedModels: ['*'],
        authIndex: 'decision-gemini:apikey:1',
      },
    ]);

    const openAIResource = decisionOpenAIToResource(config.decisionOpenAIApiKeys![0], 0);
    expect(openAIResource.brand).toBe('decisionOpenAI');
    expect(openAIResource.disabled).toBe(false);
    expect(openAIResource.selector).toEqual({
      brand: 'decisionOpenAI',
      apiKey: 'sk-openai-decision',
      baseUrl: 'https://api.openai.com',
      index: 0,
    });

    const geminiResource = decisionGeminiToResource(config.decisionGeminiApiKeys![0], 0);
    expect(geminiResource.brand).toBe('decisionGemini');
    expect(geminiResource.disabled).toBe(true);
    expect(geminiResource.selector).toEqual({
      brand: 'decisionGemini',
      apiKey: 'AIza-gemini-decision',
      baseUrl: 'https://generativelanguage.googleapis.com',
      index: 0,
    });

    expect(PROVIDER_DESCRIPTORS.decisionOpenAI.supportsTestModel).toBe(true);
    expect(PROVIDER_DESCRIPTORS.decisionGemini.supportsTestModel).toBe(true);
    expect(PROVIDER_BRAND_ORDER).toContain('decisionOpenAI');
    expect(PROVIDER_BRAND_ORDER).toContain('decisionGemini');
  });

  test('builds native decision endpoints across base URL forms', () => {
    expect(buildOpenAIDecisionsEndpoint('')).toBe('https://api.openai.com/v1/decisions');
    expect(buildOpenAIDecisionsEndpoint('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/decisions'
    );
    expect(buildOpenAIDecisionsEndpoint('https://proxy.example/v1/decisions')).toBe(
      'https://proxy.example/v1/decisions'
    );

    expect(buildGeminiDecisionsEndpoint('')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/decisions'
    );
    expect(buildGeminiDecisionsEndpoint('https://generativelanguage.googleapis.com/v1beta')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/decisions'
    );
    expect(buildGeminiDecisionsEndpoint('https://proxy.example/v1beta/decisions')).toBe(
      'https://proxy.example/v1beta/decisions'
    );
  });

  test('maps decision brands to runtime provider usage keys', () => {
    expect(getProviderUsageKey('decisionOpenAI')).toBe('decision-openai');
    expect(getProviderUsageKey('decisionGemini')).toBe('decision-gemini');
  });
});
