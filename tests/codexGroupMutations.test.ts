import { afterEach, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

test('editing grouped keys preserves per-key policies and unrelated groups', async () => {
  const group = {
    name: 'team',
    'base-url': 'https://example.invalid/v1',
    models: [{ name: 'shared' }],
    keys: [
      { 'api-key': 'first', models: [{ name: 'private', future: true }], weight: 2 },
      { 'api-key': 'second', headers: { X: 'value' }, future: 'preserve' },
    ],
  };
  const other = { name: 'other', 'base-url': group['base-url'], keys: [{ 'api-key': 'third' }] };
  const groups = [group, other];
  let written: unknown;
  apiClient.get = (async () => ({ 'api-keys': { codex: structuredClone(groups) } })) as typeof apiClient.get;
  apiClient.put = (async (_url: string, value: unknown) => { written = value; }) as typeof apiClient.put;
  const current = normalizeConfigResponse({ 'api-keys': { codex: groups } }).codexProviderGroups![0];
  await providersApi.updateCodexGroup({
    ...current,
    apiKeyEntries: [{ ...current.apiKeyEntries[0], weight: 7 }, current.apiKeyEntries[1]],
  });
  expect(written).toEqual([{ ...group, keys: [{ ...group.keys[0], weight: 7 }, group.keys[1]] }, other]);
});

test('group toggle retains each credential exclusion policy', async () => {
  const groups = [{
    name: 'team',
    'base-url': 'https://example.invalid/v1',
    'excluded-models': ['inherited'],
    keys: [
      { 'api-key': 'one', 'excluded-models': ['special'] },
      { 'api-key': 'two', future: 'keep' },
    ],
  }];
  let written: unknown;
  apiClient.get = (async () => ({ 'api-keys': { codex: structuredClone(groups) } })) as typeof apiClient.get;
  apiClient.put = (async (_url: string, value: unknown) => { written = value; }) as typeof apiClient.put;
  const current = normalizeConfigResponse({ 'api-keys': { codex: groups } }).codexProviderGroups![0];
  await providersApi.updateCodexGroup(current, true);
  expect(written).toEqual([{ ...groups[0], keys: [
    { ...groups[0].keys[0], 'excluded-models': ['special', '*'] },
    { ...groups[0].keys[1], 'excluded-models': ['inherited', '*'] },
  ] }]);
});

test('Codex group edits shared proxy and exclusions without overwriting key overrides', async () => {
  const group = {
    name: 'team',
    'base-url': 'https://example.invalid/v1',
    'proxy-url': 'direct',
    'excluded-models': ['old-model'],
    keys: [{ 'api-key': 'first', 'excluded-models': ['private'], future: true }],
  };
  let written: unknown;
  apiClient.get = (async () => ({ 'api-keys': { codex: [structuredClone(group)] } })) as typeof apiClient.get;
  apiClient.put = (async (_url: string, value: unknown) => { written = value; }) as typeof apiClient.put;
  const current = normalizeConfigResponse({ 'api-keys': { codex: [group] } }).codexProviderGroups![0];
  expect(current.proxyUrl).toBe('direct');
  expect(current.excludedModels).toEqual(['old-model']);
  await providersApi.updateCodexGroup({ ...current, proxyUrl: 'http://proxy.invalid', excludedModels: ['new-model'] });
  expect(written).toEqual([{ ...group, 'proxy-url': 'http://proxy.invalid', 'excluded-models': ['new-model'] }]);
});

test('creating a disabled Codex group stores keys without an unsupported group disabled field', async () => {
  let written: unknown;
  apiClient.get = (async () => ({ 'api-keys': { codex: [] } })) as typeof apiClient.get;
  apiClient.put = (async (_url: string, value: unknown) => { written = value; }) as typeof apiClient.put;
  await providersApi.createCodexGroup({
    name: 'new', baseUrl: 'https://example.invalid/v1', disabled: true,
    apiKeyEntries: [{ apiKey: 'fixture-a' }, { apiKey: 'fixture-b', weight: 2 }],
  });
  expect(written).toEqual([{ name: 'new', 'base-url': 'https://example.invalid/v1', keys: [
    { 'api-key': 'fixture-a', 'excluded-models': ['*'] },
    { 'api-key': 'fixture-b', weight: 2, 'excluded-models': ['*'] },
  ] }]);
});

test('stale Codex group edits fail before writing', async () => {
  const group = { name: 'team', keys: [{ 'api-key': 'fixture', weight: 1 }] };
  const current = normalizeConfigResponse({ 'api-keys': { codex: [group] } }).codexProviderGroups![0];
  let writes = 0;
  apiClient.get = (async () => ({ 'api-keys': { codex: [{ ...group, keys: [{ ...group.keys[0], weight: 8 }] }] } })) as typeof apiClient.get;
  apiClient.put = (async () => { writes += 1; }) as typeof apiClient.put;
  await expect(providersApi.updateCodexGroup(current)).rejects.toThrow();
  expect(writes).toBe(0);
});
