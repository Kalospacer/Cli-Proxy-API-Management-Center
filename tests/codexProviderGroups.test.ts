import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResourceDetailView } from '../src/features/providers/sheets/ResourceDetailView';
import { ProviderResourceTable } from '../src/features/providers/components/ProviderResourceTable';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import { buildOpenAIConfig, buildProviderGroups } from '../src/features/providers/useProviderWorkbench';

const group = (name: string, keys: string[]) => ({
  name,
  'base-url': 'https://example.invalid/v1',
  models: [{ name: 'example-model' }],
  keys: keys.map((key) => ({ 'api-key': key })),
});

describe('Codex provider groups', () => {
  test('retains distinct persisted groups alongside individual key views', () => {
    const groups = [group('first', ['fixture-a', 'fixture-b']), group('second', ['fixture-c'])];
    const config = normalizeConfigResponse({ 'api-keys': { codex: groups } });
    expect(config.codexApiKeys).toHaveLength(3);
    const codexGroups = config.codexProviderGroups;
    expect(codexGroups).toHaveLength(2);
    expect(codexGroups?.map((entry) => entry.name)).toEqual(['first', 'second']);
    expect(codexGroups?.map((entry) => entry.apiKeyEntries.length)).toEqual([2, 1]);
    const resources = buildProviderGroups(config).find((item) => item.id === 'codex')?.resources;
    expect(resources?.map((item) => item.name)).toEqual(['first', 'second']);
    expect(resources?.map((item) => item.apiKeyEntryCount)).toEqual([2, 1]);
    const markup = renderToStaticMarkup(createElement(ResourceDetailView, {
      resource: resources![0],
      onEditKey: () => undefined,
    }));
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).not.toContain('fixture-a');
    expect(markup).not.toContain('fixture-b');
  });

  test('33 keys from one persisted group produce one resource and 33 editable entries', () => {
    const keys = Array.from({ length: 33 }, (_, index) => `fixture-key-${index}`);
    const config = normalizeConfigResponse({ 'api-keys': { codex: [group('team', keys)] } });
    const resources = buildProviderGroups(config).find((item) => item.id === 'codex')?.resources;
    expect(resources).toHaveLength(1);
    expect(resources?.[0].apiKeyEntryCount).toBe(33);
    const markup = renderToStaticMarkup(createElement(ResourceDetailView, {
      resource: resources![0], onEditKey: () => undefined,
    }));
    expect(markup.match(/<button/g)).toHaveLength(33);
    expect(markup).not.toContain('fixture-key-0');
  });

  test('deduplicates only the statistics view for identical keys', () => {
    const config = normalizeConfigResponse({
      'api-keys': { codex: [{ name: 'team', keys: [
        { 'api-key': 'same', 'proxy-url': 'direct' },
        { 'api-key': 'same', 'proxy-url': 'http://proxy.invalid' },
      ] }] },
    });
    expect(config.codexProviderGroups?.[0].apiKeyEntries).toHaveLength(2);
    expect(config.codexProviderGroups?.[0].usageApiKeyEntries).toHaveLength(1);
    const resource = buildProviderGroups(config).find((item) => item.id === 'codex')!.resources[0];
    const usage = new Map([['codex', new Map([['|same', {
      success: 5, failed: 2, recentRequests: [],
    }]])]]);
    const markup = renderToStaticMarkup(createElement(ProviderResourceTable, {
      resources: [resource], usageByProvider: usage,
      onView: () => undefined, onEdit: () => undefined, onDelete: () => undefined,
    }));
    expect(markup).toContain(': 5</span>');
    expect(markup).toContain(': 2</span>');
    expect(markup).not.toContain(': 10</span>');
  });

  test('reports mixed key status rather than claiming the whole group is active', () => {
    const config = normalizeConfigResponse({
      'api-keys': { codex: [{
        name: 'mixed',
        keys: [{ 'api-key': 'one', 'excluded-models': ['*'] }, { 'api-key': 'two' }],
      }] },
    });
    const resource = buildProviderGroups(config).find((item) => item.id === 'codex')?.resources[0];
    expect(resource?.flags.mixedDisabled).toBe(true);
    expect(resource?.disabled).toBe(false);
  });

  test('a newly inserted blank key does not resurrect a removed credential', () => {
    const existing = normalizeConfigResponse({
      'api-keys': { codex: [group('team', ['fixture-a', 'fixture-b'])] },
    }).codexProviderGroups![0];
    const next = buildOpenAIConfig({
      apiKey: '', name: 'team', baseUrl: 'https://example.invalid/v1',
      proxyUrl: '', prefix: '', disabled: false, models: [], headers: [], excludedModelsText: '',
      apiKeyEntries: [
        { apiKey: '', existingApiKey: 'fixture-b', sourceIndex: 1, proxyUrl: '' },
        { apiKey: '', proxyUrl: '' },
      ],
    }, existing, 'codex');
    expect(next.apiKeyEntries.map((entry) => entry.apiKey)).toEqual(['fixture-b']);
  });

  test('retains empty or unnamed groups without a custom upstream URL', () => {
    const config = normalizeConfigResponse({
      'api-keys': { codex: [{ name: 'empty', keys: [] }, { keys: [] }] },
    });
    expect(config.codexProviderGroups).toHaveLength(2);
    expect(config.codexProviderGroups?.[0].baseUrl).toBe('');
    expect(config.codexProviderGroups?.[0].apiKeyEntries).toEqual([]);
    expect(config.codexProviderGroups?.[1].name).toBe('codex-2');
    expect(config.codexProviderGroups?.[1].source?.group).toEqual({ keys: [] });
  });
});
