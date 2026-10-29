import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import { IconCheck, IconX } from '@/components/ui/icons';
import { getProviderTotalStats, type ProviderRecentUsageMap } from '@/components/providers/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { CodexProviderGroupConfig } from '@/types/provider';
import { codexToResource } from '../adapters';
import { maskApiKey } from '@/utils/format';
import {
  getSponsorProviderDefinition,
  isMultiProtocolSponsorBrand,
  sponsorProtocolI18nKey,
  sponsorProtocolUrl,
} from '../sponsorDefinitions';
import type { ProviderResource, SponsorProviderRaw } from '../types';
import styles from './forms/sharedForm.module.scss';

interface ResourceDetailViewProps {
  resource: ProviderResource;
  usageByProvider?: ProviderRecentUsageMap;
  onEditKey?: (resource: ProviderResource) => void;
  mutationDisabled?: boolean;
}

const sponsorProtocolEntryKey = (protocol: string): string => {
  if (protocol === 'claude') return 'anthropicEntries';
  if (protocol === 'codex') return 'codexEntries';
  return `${protocol}Entries`;
};

export function ResourceDetailView({ resource, usageByProvider, onEditKey, mutationDisabled }: ResourceDetailViewProps) {
  const { t } = useTranslation();

  if (isMultiProtocolSponsorBrand(resource.brand)) {
    const definition = getSponsorProviderDefinition(resource.brand);
    const raw = resource.raw as SponsorProviderRaw;
    const openaiKeyCount = raw.openai.reduce(
      (count, item) => count + (item.config.apiKeyEntries?.length ?? 0),
      0
    );
    const codexKeyCount = raw.codex.length;
    const geminiKeyCount = raw.gemini.length;
    const firstKey =
      raw.openai
        .flatMap((item) => item.config.apiKeyEntries ?? [])
        .find((entry) => entry.apiKey?.trim())?.apiKey ??
      raw.codex.find((item) => item.config.apiKey?.trim())?.config.apiKey ??
      raw.claude.find((item) => item.config.apiKey?.trim())?.config.apiKey ??
      raw.gemini.find((item) => item.config.apiKey?.trim())?.config.apiKey;
    const baseUrl = definition.resolveBaseUrl(
      raw.openai[0]?.config.baseUrl ??
        raw.codex[0]?.config.baseUrl ??
        raw.claude[0]?.config.baseUrl ??
        raw.gemini[0]?.config.baseUrl
    );
    const protocolUrls = definition.getProtocolUrls(baseUrl);
    const protocolCounts: Record<string, number> = {
      openai: openaiKeyCount,
      codex: codexKeyCount,
      claude: raw.claude.length,
      gemini: geminiKeyCount,
    };

    return (
      <div>
        <div className={styles.detailHeader}>
          <div className={styles.sectionTitle}>{resource.name ?? resource.identifier}</div>
          <p className={styles.sectionDesc}>
            {t('providersPage.sponsor.detailHint', { provider: definition.displayName })}
          </p>
        </div>

        <div className={styles.sponsorProtocolGrid}>
          {definition.protocols.map((protocol) => (
            <div key={protocol} className={styles.sponsorProtocolCard}>
              <span className={styles.sponsorProtocolName}>
                {t(`providersPage.sponsor.protocols.${sponsorProtocolI18nKey(protocol)}`)}
              </span>
              <span className={styles.sponsorProtocolUrl}>
                {sponsorProtocolUrl(protocolUrls, protocol)}
              </span>
            </div>
          ))}
        </div>

        <dl className={styles.dl} style={{ marginTop: 16 }}>
          <div>
            <dt className={styles.dt}>{t('providersPage.detail.fields.identifier')}</dt>
            <dd className={styles.dd}>{firstKey ? maskApiKey(firstKey) : resource.identifier}</dd>
          </div>
          <div>
            <dt className={styles.dt}>{t('providersPage.detail.fields.prefix')}</dt>
            <dd className={styles.dd}>{resource.prefix ?? t('providersPage.status.none')}</dd>
          </div>
          {definition.protocols.map((protocol) => (
            <div key={protocol}>
              <dt className={styles.dt}>
                {t(`providersPage.sponsor.${sponsorProtocolEntryKey(protocol)}`)}
              </dt>
              <dd className={styles.dd}>{protocolCounts[protocol]}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const primary: Array<[string, string]> = [
    ['identifier', resource.identifier],
    ['baseUrl', resource.baseUrl ?? t('providersPage.status.notSet')],
    ['proxyUrl', resource.proxyUrl ?? t('providersPage.status.notSet')],
    ['prefix', resource.prefix ?? t('providersPage.status.none')],
    ['models', String(resource.modelCount)],
    ['headers', String(resource.headerCount)],
  ];

  const metadata: Array<[string, string]> = [
    ['authIndex', resource.authIndex ?? t('providersPage.status.notSet')],
    ['excludedModels', String(resource.excludedModelCount)],
    ['apiKeyEntries', String(resource.apiKeyEntryCount)],
  ];

  const openaiConfig =
    resource.brand === 'openaiCompatibility' || resource.brand === 'codex'
      ? (resource.raw as OpenAIProviderConfig)
      : null;
  const apiKeyEntries = openaiConfig?.apiKeyEntries ?? [];

  return (
    <div>
      <div className={styles.detailHeader}>
        <div className={styles.sectionTitle}>{resource.name ?? resource.identifier}</div>
      </div>

      <dl className={styles.dl}>
        {primary.map(([key, value]) => (
          <div key={key}>
            <dt className={styles.dt}>{t(`providersPage.detail.fields.${key}`)}</dt>
            <dd className={styles.dd}>{value}</dd>
          </div>
        ))}
      </dl>

      {openaiConfig && apiKeyEntries.length > 0 ? (
        <div className={styles.apiKeyEntriesSection}>
          <div className={styles.apiKeyEntriesLabel}>
            {t('providersPage.form.apiKeyEntriesSection')}: {apiKeyEntries.length}
          </div>
          <div className={styles.apiKeyEntryList}>
            {apiKeyEntries.map((entry, entryIndex) => {
              const member = resource.brand === 'codex'
                ? (resource.raw as CodexProviderGroupConfig).members.find(
                    (item) => item.source?.keyIndex === entry.sourceIndex
                  )
                : undefined;
              const ambiguousStats = resource.brand === 'codex' &&
                apiKeyEntries.some((other, index) => index !== entryIndex && other.apiKey === entry.apiKey);
              const entryStats = usageByProvider && !ambiguousStats
                ? getProviderTotalStats(
                    usageByProvider,
                    resource.brand === 'codex' ? 'codex' : openaiConfig.name,
                    entry.apiKey,
                    openaiConfig.baseUrl
                  )
                : { success: 0, failure: 0 };
              return (
                <div key={`${entry.apiKey}-${entryIndex}`} className={styles.apiKeyEntryCard}>
                  <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                  <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                  {member && onEditKey ? (
                    <button
                      type="button"
                      className={styles.connectivityBtnGhost}
                      disabled={mutationDisabled}
                      onClick={() => onEditKey(codexToResource(member, entryIndex))}
                    >
                      {t('providersPage.actions.edit')}
                    </button>
                  ) : null}
                  {entry.proxyUrl ? (
                    <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                  ) : null}
                  {!ambiguousStats ? (
                    <div className={styles.apiKeyEntryStats}>
                      <span className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatSuccess}`}>
                        <IconCheck size={12} /> {entryStats.success}
                      </span>
                      <span className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatFailure}`}>
                        <IconX size={12} /> {entryStats.failure}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <Collapsible label={t('providersPage.detail.metadataTitle')}>
          <dl className={styles.dl}>
            {metadata.map(([key, value]) => (
              <div key={key}>
                <dt className={styles.dt}>{t(`providersPage.detail.fields.${key}`)}</dt>
                <dd className={styles.dd}>{value}</dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      </div>
    </div>
  );
}
