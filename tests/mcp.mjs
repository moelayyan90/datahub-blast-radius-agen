import assert from 'node:assert/strict';
import {
  fetchBlastRadiusViaMcp,
  lineageResponseToAssets,
  persistReviewTagViaMcp,
  unwrapToolResult,
} from '../mcp/datahub-mcp-client.mjs';

// Regression coverage for the DataHub MCP integration used by ChangeGuard CI.
const urn = 'urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)';
const downstreamUrn = 'urn:li:dashboard:(looker,orders-dashboard)';

assert.deepEqual(
  unwrapToolResult({ structuredContent: { ok: true } }),
  { ok: true },
);
assert.deepEqual(
  unwrapToolResult({ content: [{ type: 'text', text: '{"ok":true}' }] }),
  { ok: true },
);

const normalized = lineageResponseToAssets({
  searchResults: [{
    degree: 2,
    entity: {
      urn: downstreamUrn,
      type: 'DASHBOARD',
      properties: { name: 'Orders Dashboard' },
      platform: { properties: { displayName: 'Looker' } },
      ownership: { owners: [{ owner: { username: 'data-owner' } }] },
      globalTags: { tags: [{ tag: { name: 'Critical' } }] },
    },
  }],
});
assert.equal(normalized.length, 1);
assert.equal(normalized[0].urn, downstreamUrn);
assert.equal(normalized[0].owner, 'data-owner');
assert.deepEqual(normalized[0].tags, ['Critical']);
assert.equal(normalized[0].degree, 2);

const calls = [];
const client = {
  async callTool(name, args) {
    calls.push({ name, args });
    if (name === 'get_lineage') {
      return {
        metadata: { source: 'fixture' },
        searchResults: [{
          degree: 1,
          entity: {
            urn: downstreamUrn,
            type: 'DASHBOARD',
            properties: { name: 'Orders Dashboard' },
          },
        }],
      };
    }
    if (name === 'get_entities') {
      return [{
        urn: downstreamUrn,
        type: 'DASHBOARD',
        properties: { name: 'Orders Dashboard' },
        ownership: { owners: [{ owner: { username: 'finance-bi' } }] },
        globalTags: { tags: [{ tag: { name: 'Critical' } }] },
      }];
    }
    if (name === 'add_tags') return { ok: true };
    throw new Error(`Unexpected tool: ${name}`);
  },
};

const result = await fetchBlastRadiusViaMcp({ urn, column: 'customer_id', client });
assert.equal(result.assets.length, 1);
assert.equal(result.assets[0].owner, 'finance-bi');
assert.deepEqual(result.assets[0].tags, ['Critical']);
assert.deepEqual(calls[0], {
  name: 'get_lineage',
  args: {
    urn,
    column: 'customer_id',
    query: '*',
    upstream: false,
    max_hops: 3,
    max_results: 50,
    offset: 0,
  },
});
assert.deepEqual(calls[1], {
  name: 'get_entities',
  args: { urns: [downstreamUrn] },
});

calls.length = 0;
const writeBack = await persistReviewTagViaMcp({ urn, client });
assert.deepEqual(writeBack, { ok: true });
assert.deepEqual(calls[0], {
  name: 'add_tags',
  args: {
    tag_urns: ['urn:li:tag:changeguard-reviewed'],
    entity_urns: [urn],
    column_paths: null,
  },
});

console.log('mcp tests passed');
