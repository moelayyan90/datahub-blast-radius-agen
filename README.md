# ChangeGuard — DataHub Blast Radius Agent

ChangeGuard is a pre-merge safety agent for production data changes. It turns DataHub context — downstream lineage, ownership and governance tags — into an actionable deployment decision before a destructive schema change ships.

## Why this exists

A code review can tell you that `customer_id` was renamed. It cannot tell you that the field feeds an executive dashboard, a production ML model, a regulated customer table and an ownerless transformation. DataHub can. ChangeGuard converts that graph context into an explainable **ALLOW / REVIEW / BLOCK** decision and a safe-migration plan.

## Hackathon category

**Agents That Do Real Work** + **Metadata-Aware Code Generation & Development**.

## DataHub MCP is the primary agent integration

The production/CI agent path talks to DataHub through the **official DataHub MCP Server** (`@acryldata/mcp-server-datahub`). ChangeGuard calls the official `get_lineage` tool with downstream direction and three-hop/unlimited traversal, then uses `get_entities` to enrich the highest-risk lineage hits before running the exact same deterministic policy engine used by the web demo. An optional approved write-back uses the MCP `add_tags` mutation tool.

The repository also includes a direct GraphQL adapter for the zero-credential serverless demo. That fallback exists because a public Vercel function cannot assume a judge has a local stdio MCP process or DataHub credentials. It does **not** replace the MCP integration; it keeps the judging URL useful while the production agent path remains MCP-native.

## What it does

1. Accepts a proposed dataset/schema change.
2. In the production agent/CI path, calls DataHub's official MCP `get_lineage` tool for downstream context (`upstream:false`, `max_hops:3`).
3. Calls MCP `get_entities` in a batch for the top lineage hits to enrich ownership, governance tags and platform context.
4. Scores risk using transparent deterministic rules — no opaque LLM risk score.
5. Produces an explicit `ALLOW`, `REVIEW`, or `BLOCK` decision.
6. Generates concrete pre-merge actions, a compatibility/contract-test artifact, and a machine-readable merge policy JSON.
7. Can persist a `changeguard-reviewed` marker with the official MCP `add_tags` tool when mutation tools are deliberately enabled and the tag exists.
8. Provides a credential-free public web demo with a clearly labelled deterministic fixture and a direct DataHub GraphQL live adapter.

## Run the public demo locally

No runtime package install is required for the demo server:

```bash
node dev-server.mjs
```

Open `http://127.0.0.1:4173`.

### Optional direct-GraphQL web mode

```bash
export DATAHUB_GMS_URL="http://localhost:8080"
export DATAHUB_TOKEN="<optional PAT>"
node dev-server.mjs
```

The web API calls `${DATAHUB_GMS_URL}/api/graphql`. A real zero-result response stays zero; a failed configured connection is visibly labelled `live-error-fallback`.

## Run the real DataHub MCP agent path

DataHub's official setup command is:

```bash
npx -y @acryldata/mcp-server-datahub init
```

After the MCP server is configured for your DataHub instance, run ChangeGuard:

```bash
npm run mcp:analyze -- \
  --urn 'urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)' \
  --change-type 'rename column' \
  --detail 'customer_id -> customer_key' \
  --column customer_id
```

The CLI starts `npx -y @acryldata/mcp-server-datahub`, performs the MCP initialize handshake, calls `get_lineage`, then batch-calls `get_entities` for the top downstream URNs:

```json
{
  "name": "get_lineage",
  "arguments": {
    "urn": "...",
    "column": "customer_id",
    "query": "*",
    "upstream": false,
    "max_hops": 3,
    "max_results": 50,
    "offset": 0
  }
}
```

To persist a review tag after a human-approved merge decision, enable DataHub MCP mutation tools and use `--persist`. The adapter calls `add_tags` with `urn:li:tag:changeguard-reviewed`. The tag must already exist in the target DataHub instance because the official mutation validates tag URNs before assignment.

## Architecture

```text
Proposed schema change
        |
        v
 ChangeGuard agent / CI
        |
        +----> official DataHub MCP Server
        |       get_lineage
        |       (+ add_tags for approved write-back)
        |               |
        |               v
        |          DataHub context graph
        |       lineage + owners + tags
        |               |
        +---------------+
                |
                v
       deterministic risk engine
                |
        +-------+-------------------------------+
        |                                       |
   ALLOW / REVIEW / BLOCK             generated work products
                                      • migration actions
                                      • compatibility SQL
                                      • merge policy JSON
                                      • review metadata

Public judging URL only:
ChangeGuard web API --> direct DataHub GraphQL adapter or labelled demo fixture
                         \--> same deterministic risk engine
```

## Trust-by-design behavior

ChangeGuard deliberately avoids demo theatre:

- **A real empty lineage result stays empty.** Live DataHub returning zero downstream assets never causes sample assets to be substituted.
- **A broken live connection is labelled.** A direct-GraphQL demo connection failure returns `live-error-fallback` and exposes the error.
- **Demo write-back is a preview.** The public demo never claims metadata was persisted when no DataHub credentials exist.
- **MCP and demo modes share one policy engine.** The MCP adapter is tested with an official-response-shaped fixture and injected MCP client, not a second hard-coded scoring implementation.

## Risk model

Inputs include downstream count, critical/governed assets, ownerless assets, graph depth and whether the proposed change is destructive. The implementation lives in `api/analyze.js` and is reused by `mcp/changeguard-agent.mjs`.

- **0–34:** `ALLOW`
- **35–79:** `REVIEW`
- **80–100:** `BLOCK`

## Tests

```bash
npm test
```

Tests cover the web demo, real-zero lineage behavior, labelled fallback, preview-only write-back, MCP result normalization, exact `get_lineage` arguments, exact `add_tags` write-back arguments, and reuse of the same deterministic policy engine.

## Security / privacy

No private data is required for the public demo. DataHub credentials stay in the operator's MCP configuration/environment and are never committed. MCP mutation tools are disabled by default by DataHub and ChangeGuard does not enable a write unless explicitly requested by the operator.

## License

Apache License 2.0.
