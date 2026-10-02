import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { apiClient } from '../src/services/api/client';
import { apiCallApi } from '../src/services/api/apiCall';
import { providersApi, type ProviderFamily } from '../src/services/api/providers';
import { normalizeConfigResponse, normalizeProviderGroups } from '../src/services/api/transformers';
import { initialBundledEntries, buildBundledEntries } from '../src/features/providers/bundledKeys';
import { PROVIDER_DESCRIPTORS, PROVIDER_BRAND_ORDER } from '../src/features/providers/descriptors';
import { typesafeToResource } from '../src/features/providers/adapters';
import { buildProviderKeyConfig } from '../src/features/providers/useProviderWorkbench';
import type { ProviderEntryFormInput } from '../src/features/providers/types';
import {
  useConnectivityTest,
  type ConnectivityErrorMessages,
} from '../src/features/providers/sheets/forms/useConnectivityTest';
import { useModelDiscovery } from '../src/features/providers/sheets/forms/useModelDiscovery';
import type { ProviderKeyConfig } from '../src/types';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
let requestSpy: ReturnType<typeof spyOn<typeof apiCallApi, 'request'>> | undefined;
afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
  requestSpy?.mockRestore();
});
const messages: ConnectivityErrorMessages = {
  baseUrlRequired: 'base',
  endpointInvalid: 'endpoint',
  apiKeyRequired: 'key',
  modelRequired: 'model',
  timeout: () => 'timeout',
  requestFailed: 'failed',
};
const success = { statusCode: 200, header: {}, bodyText: '', body: { data: [] } };
function captureHook<T>(hook: () => T): T {
  let result: T;
  function Harness() {
    result = hook();
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return result!;
}
function backend(family: ProviderFamily, groups: Record<string, unknown>[]) {
  let state = structuredClone(groups);
  const writes: unknown[] = [];
  apiClient.get = (async (url: string) => {
    expect(url).toBe('/config');
    return { 'api-keys': { [family]: structuredClone(state) } };
  }) as typeof apiClient.get;
  apiClient.put = (async (url: string, data: unknown) => {
    expect(url).toBe(`/config/api-keys/${family}`);
    writes.push(data);
    state = structuredClone(data as Record<string, unknown>[]);
  }) as typeof apiClient.put;
  return { groups: () => state, writes };
}
const nativeGroup = () => ({
  name: 'fixture-team',
  'base-url': 'https://example.invalid/v1',
  headers: { 'X-Group': 'keep' },
  keys: [
    {
      'api-key': '',
      'api-key-entries': [
        {
          'api-key': 'fixture-a',
          'proxy-url': 'direct',
          weight: 3,
          'auth-index': 'a-index',
          custom: 'keep-a',
        },
        { 'api-key': 'fixture-b', weight: 4, custom: 'keep-b' },
      ],
      custom: 'parent-keep',
    },
  ],
});
const rows = (groups: unknown) => normalizeProviderGroups(groups) as ProviderKeyConfig[];

describe('restored native bundled key patches', () => {
  test('reads bundled-only rows rather than dropping them and retains source identities', () => {
    const cfg = normalizeConfigResponse({
      'api-keys': { typesafe: [nativeGroup()] },
      'typesafe-api-key': [{ 'api-key': 'legacy-must-not-read' }],
    });
    expect(cfg.typesafeApiKeys).toHaveLength(1);
    expect(cfg.typesafeApiKeys![0].apiKeyEntries).toMatchObject([
      { apiKey: 'fixture-a', sourceIndex: 0, weight: 3, authIndex: 'a-index' },
      { apiKey: 'fixture-b', sourceIndex: 1, weight: 4 },
    ]);
    expect(cfg.typesafeApiKeys![0].source).toMatchObject({ groupIndex: 0, keyIndex: 0 });
    expect(
      normalizeConfigResponse({ 'typesafe-api-key': [{ 'api-key': 'legacy' }] }).typesafeApiKeys
    ).toEqual([]);
  });
  test('initializes a legacy single key as a preserved blank password entry', () => {
    const old = {
      apiKey: 'fixture-single',
      proxyUrl: 'direct',
      weight: 7,
      authIndex: 'single-index',
    };
    const entries = initialBundledEntries(old);
    expect(entries[0]).toMatchObject({
      apiKey: '',
      existingApiKey: 'fixture-single',
      proxyUrl: '',
      weight: undefined,
      authIndex: 'single-index',
    });
    expect(buildBundledEntries(entries, old)[0].apiKey).toBe('fixture-single');
  });
  test('legacy single-key editing retains current parent proxy and weight', () => {
    const old: ProviderKeyConfig = { apiKey: 'fixture-single', proxyUrl: 'direct', weight: 7 };
    const input: ProviderEntryFormInput = {
      apiKey: '',
      name: '',
      baseUrl: 'https://example.invalid/v1',
      proxyUrl: 'http://new-proxy.invalid:8080',
      weight: 11,
      prefix: '',
      disabled: false,
      models: [],
      headers: [],
      excludedModelsText: '',
      apiKeyEntries: initialBundledEntries(old),
    };
    const next = buildProviderKeyConfig('codex', input, old);
    expect(next.apiKey).toBe('fixture-single');
    expect(next.proxyUrl).toBe('http://new-proxy.invalid:8080');
    expect(next.weight).toBe(11);
    expect('apiKeyEntries' in next ? next.apiKeyEntries : undefined).toBeUndefined();
  });
  test('keeps each original key on empty edits and does not steal removed rows by list index', () => {
    const cfg = rows([nativeGroup()])[0];
    const entries = initialBundledEntries(cfg);
    const desired = buildBundledEntries([{ ...entries[1], apiKey: 'rotated-b' }, entries[0]], cfg);
    expect(desired.map((x) => x.apiKey)).toEqual(['rotated-b', 'fixture-a']);
    expect(desired.map((x) => x.sourceIndex)).toEqual([1, 0]);
    expect(buildBundledEntries([{ apiKey: '', proxyUrl: '' }], cfg)).toEqual([]);
  });
  test.each(['codex', 'xai', 'typesafe'] as const)(
    '%s rotation/reorder keeps raw per-key metadata and omits response authIndex',
    async (family) => {
      const b = backend(family, [nativeGroup()]);
      const row = rows(b.groups())[0];
      const entries = row.apiKeyEntries!;
      const next = {
        ...row,
        apiKeyEntries: [
          { ...entries[1], apiKey: 'rotated-b', weight: 6 },
          { ...entries[0], weight: undefined },
        ],
      };
      if (family === 'codex') await providersApi.updateCodexConfig(row.apiKey, row.baseUrl, next);
      else if (family === 'xai') await providersApi.updateXAIConfig(row.apiKey, row.baseUrl, next);
      else await providersApi.updateTypeSafeConfig(row.apiKey, row.baseUrl, next);
      const key = (b.groups()[0].keys as Record<string, unknown>[])[0];
      expect(key.custom).toBe('parent-keep');
      expect(b.groups()[0].headers).toEqual({ 'X-Group': 'keep' });
      expect(key['api-key-entries']).toEqual([
        { 'api-key': 'rotated-b', weight: 6, custom: 'keep-b' },
        { 'api-key': 'fixture-a', 'proxy-url': 'direct', custom: 'keep-a' },
      ]);
    }
  );
  test('rejects a duplicated bundled entry identity without writing', async () => {
    const b = backend('codex', [nativeGroup()]);
    const row = rows(b.groups())[0];
    await expect(
      providersApi.updateCodexConfig('', row.baseUrl, {
        ...row,
        apiKeyEntries: [{ ...row.apiKeyEntries![0], apiKey: 'rotated' }, row.apiKeyEntries![0]],
      })
    ).rejects.toThrow();
    expect(b.writes).toHaveLength(0);
  });
  test('TypeSafe create/update/delete uses v8 groups and retains unrelated siblings', async () => {
    const b = backend('typesafe', [{ name: 'existing', keys: [{ 'api-key': 'existing-key' }] }]);
    await providersApi.createTypeSafeConfig({
      apiKey: '',
      baseUrl: 'https://api.typesafe.ai',
      apiKeyEntries: [{ apiKey: 'fixture-a', proxyUrl: 'direct', weight: 5 }],
    });
    expect(b.groups()).toHaveLength(2);
    const created = rows(b.groups())[1];
    await providersApi.updateTypeSafeConfig(created.apiKey, created.baseUrl, {
      ...created,
      priority: 8,
    });
    const updated = rows(b.groups())[1];
    await providersApi.deleteTypeSafeConfig(updated.apiKey, updated.baseUrl, updated.source);
    expect((b.groups()[0].keys as Record<string, unknown>[])[0]['api-key']).toBe('existing-key');
    expect(b.groups()[1].keys).toEqual([]);
  });
  test('registers TypeSafe in workbench, preserves raw selector and translates all four locales', () => {
    expect(PROVIDER_BRAND_ORDER).toContain('typesafe');
    expect(PROVIDER_DESCRIPTORS.typesafe.supportsTestModel).toBe(false);
    expect(PROVIDER_DESCRIPTORS.typesafe.supportsApiKey).toBe(true);
    expect(PROVIDER_DESCRIPTORS.typesafe.supportsApiKeyEntries).toBe(true);
    const resource = typesafeToResource(rows([nativeGroup()])[0], 0);
    expect(resource.brand).toBe('typesafe');
    expect(resource.apiKeyEntryCount).toBe(2);
    expect(resource.selector).toMatchObject({ brand: 'typesafe', apiKey: '' });
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru'])
      expect(
        JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')).providersPage
          .providerNames.typesafe
      ).toBe('TypeSafe');
  });
  test.each(['codex', 'xai'] as const)(
    '%s per-key tests use Responses and forward the selected proxy/key',
    async (brand) => {
      requestSpy = spyOn(apiCallApi, 'request').mockResolvedValue(success);
      const hook = captureHook(() =>
        useConnectivityTest(
          {
            brand,
            baseUrl: 'https://upstream.example/v1',
            models: [{ name: 'fixture-model' }],
            formHeaders: [],
            apiKeyEntries: [
              { apiKey: 'fixture-a', proxyUrl: 'direct' },
              {
                apiKey: '',
                existingApiKey: 'fixture-b',
                proxyUrl: 'http://proxy.invalid:8080',
                authIndex: 'b-index',
              },
            ],
          },
          messages
        )
      );
      await hook.runOpenAIAllKeys();
      expect(requestSpy.mock.calls).toHaveLength(2);
      const requests = requestSpy.mock.calls.map((x) => x[0]);
      expect(requests.map((x) => x.header?.Authorization)).toEqual([
        'Bearer fixture-a',
        'Bearer fixture-b',
      ]);
      expect(requests.map((x) => x.proxy_url)).toEqual(['direct', 'http://proxy.invalid:8080']);
      expect(requests[1].authIndex).toBe('b-index');
      for (const req of requests) {
        expect(req.url).toEndWith('/responses');
        expect(JSON.parse(req.data!)).toEqual({
          model: 'fixture-model',
          input: 'Hi',
          stream: false,
        });
      }
    }
  );
  test.each(['codex', 'xai'] as const)(
    '%s discovery uses first usable bundled key with its proxy and authIndex',
    async (brand) => {
      requestSpy = spyOn(apiCallApi, 'request').mockResolvedValue(success);
      const hook = captureHook(() =>
        useModelDiscovery({
          brand,
          baseUrl: 'https://upstream.example/v1',
          formHeaders: [],
          apiKeyEntries: [
            {
              apiKey: '',
              existingApiKey: 'fixture-key',
              proxyUrl: 'direct',
              authIndex: 'entry-index',
            },
          ],
        })
      );
      await hook.fetch();
      const req = requestSpy.mock.calls[0][0];
      expect(req.header?.Authorization).toBe('Bearer fixture-key');
      expect(req.proxy_url).toBe('direct');
      expect(req.authIndex).toBe('entry-index');
    }
  );
  test('TypeSafe is not probed through a generic Responses request', async () => {
    requestSpy = spyOn(apiCallApi, 'request').mockResolvedValue(success);
    const hook = captureHook(() =>
      useConnectivityTest(
        {
          brand: 'typesafe',
          baseUrl: 'https://api.typesafe.ai',
          models: [{ name: 'jev-fixture' }],
          formHeaders: [],
          apiKeyEntries: [{ apiKey: 'fixture', proxyUrl: '' }],
        },
        messages
      )
    );
    await hook.runOpenAIAllKeys();
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
