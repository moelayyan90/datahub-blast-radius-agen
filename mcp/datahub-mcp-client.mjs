import { spawn } from 'node:child_process';
import readline from 'node:readline';

/**
 * Minimal stdio MCP client used by ChangeGuard to talk to DataHub's official
 * @acryldata/mcp-server-datahub process without coupling the risk engine to a
 * particular agent framework.
 */
export class StdioMcpClient {
  constructor({
    command = process.env.DATAHUB_MCP_COMMAND || 'npx',
    args = process.env.DATAHUB_MCP_ARGS
      ? JSON.parse(process.env.DATAHUB_MCP_ARGS)
      : ['-y', '@acryldata/mcp-server-datahub'],
    env = {},
    timeoutMs = Number(process.env.DATAHUB_MCP_TIMEOUT_MS || 30_000),
  } = {}) {
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
  }

  async start() {
    if (this.child) return;
    this.child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.env,
      windowsHide: true,
    });

    this.child.on('exit', (code, signal) => {
      const err = new Error(`DataHub MCP server exited (${code ?? signal ?? 'unknown'})`);
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(err);
      }
      this.pending.clear();
      this.child = null;
    });

    this.child.stderr.on('data', (chunk) => {
      if (process.env.CHANGEGUARD_MCP_DEBUG === '1') process.stderr.write(chunk);
    });

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let message;
      try { message = JSON.parse(trimmed); } catch { return; }
      if (message.id == null) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });

    await this.request('initialize', {
      protocolVersion: process.env.MCP_PROTOCOL_VERSION || '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'changeguard', version: '1.1.0' },
    });
    this.notify('notifications/initialized', {});
  }

  request(method, params = {}) {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('MCP client is not started'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  notify(method, params = {}) {
    if (!this.child?.stdin?.writable) return;
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async callTool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    return unwrapToolResult(result);
  }

  async close() {
    if (!this.child) return;
    try { this.child.stdin.end(); } catch {}
    const child = this.child;
    this.child = null;
    setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, 250).unref();
  }
}

export function unwrapToolResult(result) {
  if (!result) return null;
  if (result.structuredContent != null) return result.structuredContent;
  const texts = Array.isArray(result.content)
    ? result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text)
    : [];
  if (!texts.length) return result;
  const text = texts.join('\n').trim();
  try { return JSON.parse(text); } catch { return text; }
}

function deepValue(obj, paths) {
  for (const path of paths) {
    let value = obj;
    for (const key of path.split('.')) value = value?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

function tagNames(entity) {
  const candidates = [
    entity?.globalTags?.tags,
    entity?.tags,
    entity?.properties?.tags,
  ].find(Array.isArray) || [];
  return candidates.map((item) => (
    typeof item === 'string' ? item : item?.tag?.name || item?.tag?.properties?.name || item?.name || item?.urn || null
  )).filter(Boolean);
}

function ownerName(entity) {
  const owners = entity?.ownership?.owners || entity?.owners || [];
  const first = Array.isArray(owners) ? owners[0] : null;
  const owner = first?.owner || first;
  return owner?.username || owner?.name || owner?.properties?.displayName || owner?.urn || null;
}

export function lineageResponseToAssets(lineage) {
  const searchResults = lineage?.downstreams?.searchResults || lineage?.downstream?.searchResults || lineage?.searchResults || [];
  return searchResults.map((item) => {
    const entity = item?.entity || item || {};
    return {
      urn: entity.urn,
      name: deepValue(entity, ['properties.name','name','dashboardId','chartId','flowId','jobId','urn']),
      type: entity.type || 'Entity',
      platform: deepValue(entity, ['platform.properties.displayName','platform.displayName','platform.name','tool','orchestrator','type']),
      owner: ownerName(entity),
      domain: deepValue(entity, ['domain.domain.properties.name','domain.properties.name','domain.name']) || 'DataHub',
      tags: tagNames(entity),
      degree: item.degree ?? 1,
      lineageColumns: item.lineageColumns || [],
    };
  }).filter((asset) => asset.urn);
}

export async function fetchBlastRadiusViaMcp({ urn, column = null, client = null } = {}) {
  if (!urn) throw new Error('urn is required');
  const ownedClient = client || new StdioMcpClient({
    env: {
      TOOLS_IS_MUTATION_ENABLED: process.env.TOOLS_IS_MUTATION_ENABLED || 'false',
    },
  });
  if (!client) await ownedClient.start();
  try {
    const lineage = await ownedClient.callTool('get_lineage', {
      urn,
      column: column || null,
      query: '*',
      upstream: false,
      max_hops: 3,
      max_results: 50,
      offset: 0,
    });
    let assets = lineageResponseToAssets(lineage);

    const topUrns = assets.slice(0, 10).map((asset) => asset.urn);
    if (topUrns.length) {
      try {
        const details = await ownedClient.callTool('get_entities', { urns: topUrns });
        const rows = Array.isArray(details) ? details : (details ? [details] : []);
        const byUrn = new Map(rows.filter((row) => row?.urn).map((row) => [row.urn, row]));
        assets = assets.map((asset) => {
          const detail = byUrn.get(asset.urn);
          if (!detail) return asset;
          const enriched = lineageResponseToAssets({ searchResults: [{ entity: detail, degree: asset.degree }] })[0];
          if (!enriched) return asset;
          return {
            ...asset,
            name: enriched.name || asset.name,
            type: enriched.type || asset.type,
            platform: enriched.platform || asset.platform,
            owner: enriched.owner || asset.owner,
            domain: enriched.domain || asset.domain,
            tags: enriched.tags.length ? enriched.tags : asset.tags,
          };
        });
      } catch (error) {
        if (process.env.CHANGEGUARD_MCP_DEBUG === '1') {
          console.error(`DataHub MCP get_entities enrichment skipped: ${error.message}`);
        }
      }
    }

    return { lineage, assets };
  } finally {
    if (!client) await ownedClient.close();
  }
}

export async function persistReviewTagViaMcp({ urn, tagUrn = 'urn:li:tag:changeguard-reviewed', client = null } = {}) {
  if (!urn) throw new Error('urn is required');
  const ownedClient = client || new StdioMcpClient({ env: { TOOLS_IS_MUTATION_ENABLED: 'true' } });
  if (!client) await ownedClient.start();
  try {
    return await ownedClient.callTool('add_tags', {
      tag_urns: [tagUrn],
      entity_urns: [urn],
      column_paths: null,
    });
  } finally {
    if (!client) await ownedClient.close();
  }
}
