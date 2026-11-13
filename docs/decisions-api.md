# Native decision APIs

CLIProxyAPI exposes three independent decision protocols. It forwards each request body and response unchanged; it does not translate JEV, OpenAI, and Gemini into one another. These APIs are not chat endpoints and do not support streaming.

| Provider | Downstream endpoint | Upstream endpoint | v8 credential family |
| --- | --- | --- | --- |
| TypeSafe JEV | `POST /v1/systemone` | `POST {base-url}/v1/systemone` | `api-keys.typesafe` |
| OpenAI Decisions | `POST /v1/decisions` or `POST /openai/v1/decisions` | `POST https://api.openai.com/v1/decisions` | `api-keys.decision-openai` |
| Gemini Decisions | `POST /v1beta/decisions` | `POST https://generativelanguage.googleapis.com/v1beta/decisions` | `api-keys.decision-gemini` |

Each decision protocol has its own v8 credential family (`api-keys.decision-openai` and `api-keys.decision-gemini`) and dedicated management card (`OpenAI Decisions` and `Gemini Decisions`), isolated from ordinary Codex and Gemini chat credentials.

## OpenAI example

```bash
curl -X POST "http://127.0.0.1:8317/v1/decisions" \
  -H "Authorization: Bearer CPA_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-6-luna-decision",
    "input": "I was charged twice for my order.",
    "questions": [{
      "type": "predicate",
      "name": "refund_requested",
      "instructions": "Does the customer ask for a refund?"
    }]
  }'
```

## Gemini example

```bash
curl -X POST "http://127.0.0.1:8317/v1beta/decisions" \
  -H "Authorization: Bearer CPA_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-decision-1",
    "input": "The blue mug I ordered on Monday arrived cracked on Wednesday.",
    "questions": {
      "is_damaged": {
        "type": "noul",
        "instructions": "Did the item arrive damaged?"
      }
    }
  }'
```
