# ChangeGuard sample output

This example lets judges evaluate the generated work product without configuring a DataHub instance. It uses the same deterministic fixture and policy engine as the credential-free demo.

## Proposed change

- Source URN: `urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)`
- Change type: `rename column`
- Detail: `customer_id -> customer_key`
- Column: `customer_id`

## Decision

**BLOCK — CRITICAL risk (100/100)**

The bundled demo lineage contains 5 downstream assets, including 4 governed/critical assets and 1 ownerless asset, with downstream impact extending to degree 3.

### Required actions

1. Assign ownership to the ownerless downstream asset before merge.
2. Require governance approval for critical / regulated downstream assets.
3. Block the merge until required approvals and compatibility checks are complete.
4. Run the generated contract test against the proposed schema before deployment.
5. Notify owners of degree-1 and degree-2 dependencies.
6. Persist the review outcome to DataHub so future agents inherit the decision.

## Generated compatibility SQL

```sql
-- ChangeGuard compatibility test
-- Run during the dual-write migration window before removing customer_id.
SELECT COUNT(*) AS mismatched_rows
FROM prod.orders
WHERE (customer_id <> customer_key)
   OR (customer_id IS NULL AND customer_key IS NOT NULL)
   OR (customer_id IS NOT NULL AND customer_key IS NULL);
-- Expected: mismatched_rows = 0
```

## Generated merge policy

```json
{
  "schemaVersion": 1,
  "sourceUrn": "urn:li:dataset:(urn:li:dataPlatform:snowflake,prod.orders,PROD)",
  "decision": "BLOCK",
  "riskScore": 100,
  "riskLevel": "CRITICAL",
  "requiredApprovals": [
    "governance",
    "downstream-owners"
  ],
  "impactedUrns": [
    "urn:li:dataset:(snowflake,analytics.revenue_daily,PROD)",
    "urn:li:dashboard:(looker,executive-revenue)",
    "urn:li:dataset:(snowflake,analytics.customer_ltv,PROD)",
    "urn:li:dataset:(snowflake,analytics.weekly_growth,PROD)",
    "urn:li:mlModel:(mlflow,churn-v3)"
  ]
}
```

## Why this is useful

Instead of merely showing lineage, ChangeGuard turns DataHub context into a pre-merge control: a machine-readable decision, explicit approval requirements, and a concrete compatibility test that can be executed before a destructive schema migration ships.
