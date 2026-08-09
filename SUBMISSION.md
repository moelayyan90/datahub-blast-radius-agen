# ChangeGuard — Devpost Submission Pack

## One-line pitch

**ChangeGuard is a pre-merge DataHub agent that calculates the downstream blast radius of destructive data changes and returns an explainable ALLOW / REVIEW / BLOCK decision before production breaks.**

## Challenge categories

Primary: **Agents That Do Real Work**  
Secondary: **Metadata-Aware Code Generation & Development**

## DataHub technologies used

- DataHub OSS / Core Platform
- DataHub MCP Server (`@acryldata/mcp-server-datahub`)
- DataHub GraphQL API for the credential-free hosted demo adapter

## Project description

Data teams routinely review schema changes without knowing their real downstream impact. A seemingly small rename or dropped field can silently break dashboards, transformations, governed datasets, and ML models several hops away.

ChangeGuard turns DataHub's context graph into a pre-merge safety gate. Given a proposed destructive change, the agent reads downstream lineage through the official DataHub MCP Server, enriches impacted entities with ownership and governance context, scores the change with transparent deterministic rules, and produces an explicit **ALLOW**, **REVIEW**, or **BLOCK** decision.

The result is not just a warning. ChangeGuard generates concrete migration actions, a compatibility/contract-test SQL artifact, and a machine-readable merge-policy JSON file. When mutation tools are deliberately enabled, it can also write a `changeguard-reviewed` tag back to DataHub so future humans and agents inherit the review state.

The public demo uses the exact same policy engine as the MCP agent path. It includes a clearly labelled deterministic fixture so judges can test the UX without needing private DataHub credentials, plus an optional live DataHub GraphQL adapter. A real empty lineage response remains empty, and a failed live connection is explicitly labelled rather than silently pretending demo data is live.

## Why it matters

ChangeGuard moves DataHub context left into the software-delivery lifecycle. Instead of discovering blast radius after deployment, teams can evaluate it before merge while the change is still cheap to alter. This makes lineage, ownership, and governance metadata operational rather than merely descriptive.

## What happens end-to-end

1. A developer proposes a destructive dataset/schema change.
2. ChangeGuard asks DataHub for downstream lineage through MCP `get_lineage`.
3. It enriches the highest-risk downstream assets through MCP `get_entities`.
4. A deterministic risk engine evaluates blast radius, critical/governed assets, ownerless assets, graph depth, and whether the change is breaking.
5. The agent returns ALLOW / REVIEW / BLOCK.
6. It generates migration actions, compatibility SQL, and merge-policy JSON.
7. With mutation tools explicitly enabled, it can persist an approved review marker using MCP `add_tags`.

## Judge-friendly sample output

See `examples/sample-changeguard-output.json` for a complete BLOCK decision showing:

- downstream blast-radius evidence,
- governed / critical asset counts,
- ownerless dependency detection,
- generated migration actions,
- compatibility SQL,
- required approvals,
- machine-readable merge policy.

## Setup

### Public/local demo

```bash
node dev-server.mjs
```

Open `http://127.0.0.1:4173`.

### Real DataHub MCP path

```bash
npx -y @acryldata/mcp-server-datahub init
npm run mcp:analyze -- \
  --urn 'urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)' \
  --change-type 'rename column' \
  --detail 'customer_id -> customer_key' \
  --column customer_id
```

### Tests

```bash
npm test
```

## Suggested demo-video flow (<3 minutes)

1. **Problem (15–20 sec):** show a destructive schema change that appears harmless in a normal code review.
2. **Run ChangeGuard (30–40 sec):** enter the source URN and proposed rename/drop.
3. **Show DataHub context (30–40 sec):** downstream dependencies, critical assets, ownerless asset, multi-hop lineage.
4. **Show decision (20–30 sec):** highlight BLOCK / REVIEW / ALLOW and explain the deterministic score.
5. **Show generated artifacts (30–40 sec):** migration actions, compatibility SQL, merge-policy JSON.
6. **Show MCP implementation (20–30 sec):** briefly point to `get_lineage`, `get_entities`, and optional `add_tags` integration in the repository.
7. **Close (10 sec):** "ChangeGuard turns DataHub metadata into a pre-merge control plane for safer data changes."

## Submission checklist

- [x] Public repository
- [x] Apache 2.0 LICENSE in repository
- [x] Full source code and setup instructions
- [x] Official DataHub MCP Server integration
- [x] Sample generated output in `examples/`
- [x] English project description
- [ ] Project/testing URL entered in Devpost
- [ ] Public YouTube/Vimeo demo URL entered in Devpost
- [ ] Most Valuable Feedback section completed / opted in
- [ ] Final Devpost submission submitted before deadline
