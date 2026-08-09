# ChangeGuard — Devpost submission copy

## Tagline

Pre-merge blast-radius analysis for destructive data changes, powered by DataHub context.

## Inspiration

Data teams can review a schema diff and still miss the real production impact. A renamed or dropped field can feed executive dashboards, regulated datasets, ML models, and transformations owned by several teams. The missing piece is organizational context at the moment a change is reviewed.

ChangeGuard uses DataHub to turn that context into an explicit deployment decision before the change ships.

## What it does

ChangeGuard accepts a proposed dataset or schema change and asks DataHub for downstream context. In the production/CI path it uses the official DataHub MCP Server to retrieve lineage and enrich high-risk entities with ownership, governance tags, and platform metadata.

It then runs a transparent deterministic risk policy and returns one of three decisions: **ALLOW**, **REVIEW**, or **BLOCK**.

For every analysis it also generates practical work products a data team can use immediately:

- a prioritized migration/action plan;
- a compatibility or contract-test SQL artifact;
- a machine-readable merge policy JSON;
- required approval groups based on governance and ownership risk;
- an optional DataHub write-back marker after an approved review.

## How we built it

The core is a Node.js agent and deterministic policy engine. The MCP path starts the official `@acryldata/mcp-server-datahub` server, calls `get_lineage` for downstream impact, batch-calls `get_entities` for metadata enrichment, and can call `add_tags` for an explicitly approved write-back.

The public web demo and MCP agent share the same policy engine so judges are evaluating the same decision logic. The demo also includes a labelled deterministic fixture so it can be explored without exposing DataHub credentials.

## Challenges we ran into

The key design challenge was avoiding demo theatre. A credential-free demo is useful for judges, but it must not pretend fixture data came from a live catalog. ChangeGuard therefore distinguishes demo, live DataHub, and live-connection-error fallback modes. A real empty lineage result remains empty rather than silently substituting sample assets.

We also kept write-back deliberate: mutation tools are not assumed to be enabled, and ChangeGuard only attempts the review tag when the operator explicitly requests persistence.

## Accomplishments that we're proud of

- Uses the official DataHub MCP Server as the primary agent integration.
- Converts metadata into an enforceable pre-merge decision rather than only displaying lineage.
- Reuses one deterministic policy engine across demo and MCP paths.
- Produces concrete SQL and JSON artifacts that can be reviewed or inserted into CI workflows.
- Makes fixture/fallback behavior visible instead of presenting synthetic context as live metadata.
- Includes tests for MCP argument shapes, result normalization, fallback behavior, zero-lineage behavior, and write-back arguments.

## What we learned

Metadata becomes substantially more valuable when it is moved earlier in the software delivery lifecycle. Lineage, ownership, and governance signals are often consulted only after an incident. ChangeGuard applies the same graph before deployment, where the cost of stopping a dangerous change is much lower.

We also learned that an agent does not need an opaque LLM score to be useful. DataHub provides high-value context; a deterministic and explainable policy can make the resulting action safer and easier to trust.

## What's next for ChangeGuard

The next step is a native pull-request check that posts the DataHub-derived decision directly into GitHub and blocks protected branches when the policy returns BLOCK. We also want configurable policy packs for regulated data, production ML assets, and organization-specific ownership rules, plus richer DataHub write-back so future agents inherit the complete review outcome.

## Built with

DataHub, DataHub MCP Server, Model Context Protocol, Node.js, JavaScript, GraphQL, Vercel-compatible serverless API, CI/CD policy automation.

## Challenge category

Primary: **Agents That Do Real Work**

Secondary fit: **Metadata-Aware Code Generation & Development**

## DataHub technologies used

- DataHub OSS / Core Platform
- DataHub MCP Server

## Repository

https://github.com/moelayyan90/datahub-blast-radius-agen

## Testing instructions

For the credential-free demo, clone the repository and run:

```bash
node dev-server.mjs
```

Then open `http://127.0.0.1:4173`.

For the real DataHub MCP path, first configure the official MCP server:

```bash
npx -y @acryldata/mcp-server-datahub init
```

Then run:

```bash
npm run mcp:analyze -- --urn 'urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)' --change-type 'rename column' --detail 'customer_id -> customer_key' --column customer_id
```

Sample generated output is available in `examples/changeguard-sample-output.md`.
