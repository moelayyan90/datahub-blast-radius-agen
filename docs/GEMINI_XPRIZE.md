# Gemini XPRIZE / Google Cloud integration

ChangeGuard now includes an optional **Google Cloud Vertex AI Gemini** remediation-advisor path alongside its deterministic DataHub risk engine.

The deterministic ALLOW / REVIEW / BLOCK policy remains authoritative. Gemini receives the structured decision and a bounded set of downstream assets, then produces an operator-oriented remediation plan. The prompt explicitly prohibits inventing owners, incidents, approvals, customer facts, or metrics.

## Why Vertex AI

The integration uses the Vertex AI `generateContent` endpoint for Google publisher models:

`POST https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`

Default model: `gemini-2.5-flash`.

## Configuration

No Google Cloud credential is committed to this repository. Configure the runtime with:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="global"
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
export VERTEX_GEMINI_MODEL="gemini-2.5-flash" # optional
```

Google Cloud's Vertex AI quickstart requires a Google Cloud project, Vertex AI API access, appropriate IAM permissions, and authentication. Billing may be required by Google Cloud. Do not enable paid usage solely for this project without reviewing current pricing and budget controls.

## API flow

1. Call ChangeGuard's existing `/api/analyze` endpoint to obtain the deterministic decision and DataHub blast-radius context.
2. POST that result to `/api/gemini-advisory` as:

```json
{
  "decision": {
    "urn": "...",
    "risk": {},
    "assets": []
  }
}
```

3. When Vertex AI is configured, the endpoint returns the Gemini remediation advisory. Without credentials, it returns a clear `503` and never pretends that Google Cloud inference ran.

## Evidence discipline for the competition

Code presence is not evidence of production usage. Before any competition submission claims that Vertex AI operated the business, retain real, non-secret evidence such as dated Vertex AI request/usage logs or Cloud Monitoring screenshots, plus the corresponding product workflow. Never fabricate API usage, customer activity, revenue, testimonials, or P&L data.

## Tests

`npm test` includes a dependency-free regression test for the Vertex AI request shape using an injected fake fetch. It makes **no paid API call** and requires no credentials.
