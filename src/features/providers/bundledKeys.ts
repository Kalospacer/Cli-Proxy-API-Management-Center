import type { ApiKeyEntry, ProviderKeyConfig } from '@/types';
import type { ApiKeyEntryInput, ProviderBrand } from './types';

export const isBundledKeyBrand = (brand: ProviderBrand): boolean =>
  brand === 'codex' || brand === 'xai' || brand === 'typesafe';

// 老单密钥配置进入多密钥编辑器时保留原值，不把空密码框当成删除。
export const initialBundledEntries = (config?: ProviderKeyConfig): ApiKeyEntryInput[] => {
  const entries = config?.apiKeyEntries?.length
    ? config.apiKeyEntries
    : config?.apiKey?.trim()
      ? [
          {
            apiKey: config.apiKey,
            authIndex: config.authIndex,
          },
        ]
      : [{ apiKey: '' }];
  return entries.map((entry) => ({
    apiKey: '',
    existingApiKey: entry.apiKey,
    sourceIndex: 'sourceIndex' in entry ? entry.sourceIndex : undefined,
    proxyUrl: entry.proxyUrl ?? '',
    weight: entry.weight,
    authIndex: entry.authIndex,
  }));
};

export const buildBundledEntries = (
  input: ApiKeyEntryInput[],
  existing?: ProviderKeyConfig
): ApiKeyEntry[] =>
  input.flatMap((entry) => {
    const original =
      entry.sourceIndex === undefined
        ? undefined
        : existing?.apiKeyEntries?.find((old) => old.sourceIndex === entry.sourceIndex);
    const apiKey =
      entry.apiKey.trim() || entry.existingApiKey?.trim() || original?.apiKey.trim() || '';
    return apiKey
      ? [
          {
            apiKey,
            sourceIndex: entry.sourceIndex,
            proxyUrl: entry.proxyUrl.trim() || undefined,
            weight: entry.weight,
            authIndex: entry.authIndex?.trim() || undefined,
          },
        ]
      : [];
  });
