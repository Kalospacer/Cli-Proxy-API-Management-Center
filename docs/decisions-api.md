# Native decision API clients

CLIProxyAPI serves three independent, unmodified decision protocols. The Management Center continues to manage their existing TypeSafe, Codex, and Gemini credential groups; no new provider family is introduced.

| Protocol | Client endpoint | Existing credential group |
| --- | --- | --- |
| TypeSafe JEV | `POST /v1/systemone` | `api-keys.typesafe` |
| OpenAI Decisions | `POST /v1/decisions` | `api-keys.codex` with an official `api.openai.com` API key |
| Gemini Decisions | `POST /v1beta/decisions` | `api-keys.gemini` with an official `generativelanguage.googleapis.com` API key |

OpenAI's `/openai/v1/decisions` alias is also supported. Decision models are specialized non-chat endpoints: they do not need a chat model declaration or a standard connectivity probe. Third-party Codex groups, OAuth credentials, and Gemini's OpenAI-compatible chat endpoint are not eligible for native Decisions forwarding.

Clients authenticate to CLIProxyAPI with its ordinary downstream API key. The proxy supplies the selected upstream credential and returns the provider's native response, including `401`, `403`, `429`, and `5xx` credential rotation. JEV keeps its special `detail.error_type=authentication_error` handling for `403`.

The backend implementation and request examples are documented in `docs/decisions-api.md` in the CLIProxyAPI repository.
