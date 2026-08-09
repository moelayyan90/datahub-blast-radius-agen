#!/usr/bin/env node
import { fetchBlastRadiusViaMcp, persistReviewTagViaMcp } from './datahub-mcp-client.mjs';
import { buildDecision } from '../api/analyze.js';

function argsFromCli(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

const args = argsFromCli(process.argv);
if (!args.urn) {
  console.error('Usage: npm run mcp:analyze -- --urn <DataHub URN> --change-type "rename column" --detail "customer_id -> customer_key" [--column customer_id] [--persist]');
  process.exit(2);
}

try {
  const { lineage, assets } = await fetchBlastRadiusViaMcp({ urn: args.urn, column: args.column || null });
  const decision = buildDecision({
    urn: args.urn,
    changeType: args['change-type'] || 'drop column',
    detail: args.detail || '',
    column: args.column || '',
    assets,
    mode: 'live-datahub-mcp',
  });

  const output = {
    integration: {
      server: '@acryldata/mcp-server-datahub',
      tools: ['get_lineage', 'get_entities'],
      writeBackTool: args.persist ? 'add_tags' : null,
    },
    lineageMetadata: lineage?.metadata || null,
    ...decision,
  };

  if (args.persist) {
    output.writeBack = await persistReviewTagViaMcp({ urn: args.urn });
  }

  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, mode: 'mcp-error' }, null, 2));
  process.exit(1);
}
