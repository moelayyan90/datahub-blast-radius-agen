import assert from 'node:assert/strict';
import { buildDecision, demoAssets, generatedArtifacts, score } from '../api/analyze.js';

const urn = 'urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)';

const demoRisk = score('rename column', demoAssets);
assert.equal(demoRisk.decision, 'BLOCK');
assert.equal(demoRisk.breaking, true);
assert.ok(demoRisk.value >= 80);

const zeroRisk = score('rename column', []);
assert.equal(zeroRisk.decision, 'ALLOW');
assert.equal(zeroRisk.value, 30);

const decision = buildDecision({
  urn,
  changeType: 'rename column',
  detail: 'customer_id -> customer_key',
  column: 'customer_id',
  assets: demoAssets,
  mode: 'demo',
});

assert.equal(decision.mode, 'demo');
assert.equal(decision.risk.decision, 'BLOCK');
assert.ok(decision.generatedArtifacts.contractTest.includes('customer_id'));
assert.ok(decision.generatedArtifacts.contractTest.includes('customer_key'));

const artifacts = generatedArtifacts({
  urn,
  changeType: 'rename column',
  detail: 'customer_id -> customer_key',
  column: 'customer_id',
  risk: demoRisk,
  assets: demoAssets,
});
const policy = JSON.parse(artifacts.policyJson);
assert.equal(policy.schemaVersion, 1);
assert.equal(policy.sourceUrn, urn);
assert.equal(policy.decision, 'BLOCK');
assert.equal(policy.impactedUrns.length, demoAssets.length);

console.log('smoke tests passed');
