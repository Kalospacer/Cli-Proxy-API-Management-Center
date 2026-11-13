# Native decision APIs

The management panel renders one card per native decision protocol. Each protocol keeps its own
v8 credential family, so a decision credential never serves ordinary chat requests.

| Card | v8 credential family | Grouped multi-key |
| --- | --- | --- |
| `TypeSafe` (JEV SystemOne) | `api-keys.typesafe` | yes |
| `OpenAI Decisions` | `api-keys.decision-openai` | yes |
| `Gemini Decisions` | `api-keys.decision-gemini` | yes |

All four grouped-key cards (`codex`, `decisionOpenAI`, `decisionGemini`, `typesafe`) use the same
editor: one `api-key-entries` row per credential, plus group-level base URL, proxy URL, prefix, and
excluded models. `isGroupedKeyBrand()` in `src/features/providers/descriptors.ts` owns that rule;
`GROUPED_FAMILY` in `useProviderWorkbench.ts` maps each card to its family key.

Connectivity tests send a protocol-shaped probe: OpenAI Decisions posts a `questions` array with
`gpt-6-luna-decision`, Gemini Decisions posts a `questions` object with `gemini-decision-1` and
`x-goog-api-key`. TypeSafe has no probe endpoint, so its card omits key testing
(`supportsConnectivityTest: false`).

Endpoint contracts, request bodies, credential selection, and free-tier quotas live in the backend
repository: `docs/decisions-api.md` in CLIProxyAPI.
