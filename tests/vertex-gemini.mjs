import assert from 'node:assert/strict';
import { buildDecision, demoAssets } from '../api/analyze.js';
import { buildAdvisorPrompt, getVertexGeminiAdvisory, vertexConfigured } from '../google-cloud/vertex-gemini-advisor.mjs';

const decision = buildDecision({
  urn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)',
  changeType: 'rename column',
  detail: 'customer_id -> customer_key',
  column: 'customer_id',
  assets: demoAssets,
  mode: 'demo',
});

assert.equal(vertexConfigured({}), false);
assert.equal(vertexConfigured({ GOOGLE_CLOUD_PROJECT: 'p', GOOGLE_OAUTH_ACCESS_TOKEN: 't' }), true);

const prompt = buildAdvisorPrompt(decision);
assert.ok(prompt.includes('deterministic policy engine'));
assert.ok(prompt.includes('customer_id -> customer_key'));
assert.ok(prompt.includes('Never override'));

let requestedUrl = null;
let requestedOptions = null;
const fakeFetch = async (url, options) => {
  requestedUrl = url;
  requestedOptions = options;
  return {
    ok: true,
    async json() {
      return {
        candidates: [{ content: { parts: [{ text: '1. Notify known owners.\n2. Run the contract test.\n3. Stage the migration.\nRollback: preserve the old column.' }] } }],
      };
    },
  };
};

const advisory = await getVertexGeminiAdvisory(decision, {
  env: {
    GOOGLE_CLOUD_PROJECT: 'changeguard-test',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_OAUTH_ACCESS_TOKEN: 'test-token',
    VERTEX_GEMINI_MODEL: 'gemini-2.5-flash',
  },
  fetchImpl: fakeFetch,
});

assert.equal(advisory.configured, true);
assert.equal(advisory.provider, 'Google Cloud Vertex AI');
assert.equal(advisory.model, 'gemini-2.5-flash');
assert.ok(advisory.text.includes('Run the contract test'));
assert.ok(requestedUrl.includes('aiplatform.googleapis.com/v1/projects/changeguard-test/locations/global/publishers/google/models/gemini-2.5-flash:generateContent'));
assert.equal(requestedOptions.headers.authorization, 'Bearer test-token');

const payload = JSON.parse(requestedOptions.body);
assert.equal(payload.contents[0].role, 'user');
assert.ok(payload.contents[0].parts[0].text.includes('BLOCK'));

console.log('Vertex AI Gemini tests passed');
