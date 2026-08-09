export const demoAssets = [
  {urn:'urn:li:dataset:(snowflake,analytics.revenue_daily,PROD)',name:'revenue_daily',type:'Dataset',platform:'dbt',owner:'finance-data',domain:'Finance',tags:['Critical','Revenue'],degree:1},
  {urn:'urn:li:dashboard:(looker,executive-revenue)',name:'Executive Revenue Dashboard',type:'Dashboard',platform:'Looker',owner:'finance-bi',domain:'Finance',tags:['Critical'],degree:2},
  {urn:'urn:li:dataset:(snowflake,analytics.customer_ltv,PROD)',name:'customer_ltv',type:'Dataset',platform:'Snowflake',owner:'growth-data',domain:'Growth',tags:['PII'],degree:1},
  {urn:'urn:li:dataset:(snowflake,analytics.weekly_growth,PROD)',name:'weekly_growth',type:'Dataset',platform:'dbt',owner:null,domain:'Growth',tags:[],degree:2},
  {urn:'urn:li:mlModel:(mlflow,churn-v3)',name:'churn-v3',type:'ML Model',platform:'MLflow',owner:'ml-platform',domain:'ML',tags:['Production'],degree:3}
];

const BREAKING_CHANGE_TYPES = new Set(['drop column','rename column','schema breaking change','delete dataset']);

function ownerName(entity) {
  const owner = entity?.ownership?.owners?.[0]?.owner;
  return owner?.username || owner?.name || owner?.properties?.displayName || owner?.urn || null;
}

function entityName(entity) {
  return entity?.properties?.name || entity?.name || entity?.dashboardId || entity?.chartId || entity?.flowId || entity?.jobId || entity?.urn;
}

function platformName(entity) {
  return entity?.platform?.properties?.displayName || entity?.platform?.displayName || entity?.platform?.name || entity?.tool || entity?.orchestrator || entity?.type;
}

async function queryDataHub(urn) {
  const endpoint = process.env.DATAHUB_GMS_URL;
  if (!endpoint) return { configured: false, assets: null, error: null };

  const gql = `query Blast($urn:String!){
    scrollAcrossLineage(input:{
      query:"*",
      urn:$urn,
      count:50,
      direction:DOWNSTREAM,
      orFilters:[{and:[{condition:EQUAL,negated:false,field:"degree",values:["1","2","3+"]}]}]
    }){
      searchResults{
        degree
        entity{
          urn
          type
          ... on Dataset{
            name
            properties{name}
            platform{name displayName properties{displayName}}
            ownership{owners{owner{urn ... on CorpUser{username} ... on CorpGroup{name properties{displayName}}}}}
            globalTags{tags{tag{urn name}}}
          }
          ... on Dashboard{
            dashboardId
            tool
            properties{name}
            platform{name displayName properties{displayName}}
            ownership{owners{owner{urn ... on CorpUser{username} ... on CorpGroup{name properties{displayName}}}}}
            globalTags{tags{tag{urn name}}}
          }
          ... on Chart{
            chartId
            tool
            properties{name}
            platform{name displayName properties{displayName}}
            ownership{owners{owner{urn ... on CorpUser{username} ... on CorpGroup{name properties{displayName}}}}}
            globalTags{tags{tag{urn name}}}
          }
          ... on DataFlow{
            flowId
            orchestrator
            properties{name}
            platform{name displayName properties{displayName}}
            ownership{owners{owner{urn ... on CorpUser{username} ... on CorpGroup{name properties{displayName}}}}}
            globalTags{tags{tag{urn name}}}
          }
          ... on MLModel{
            name
            platform{name displayName properties{displayName}}
            ownership{owners{owner{urn ... on CorpUser{username} ... on CorpGroup{name properties{displayName}}}}}
            globalTags{tags{tag{urn name}}}
          }
        }
      }
    }
  }`;

  try {
    const res = await fetch(endpoint.replace(/\/$/,'') + '/api/graphql', {
      method:'POST',
      headers:{'content-type':'application/json',...(process.env.DATAHUB_TOKEN?{authorization:`Bearer ${process.env.DATAHUB_TOKEN}`}:{})},
      body:JSON.stringify({query:gql,variables:{urn}})
    });
    if(!res.ok) throw new Error(`DataHub GraphQL ${res.status}`);
    const body = await res.json();
    if(body.errors?.length) throw new Error(body.errors.map(e=>e.message).join('; ') || 'DataHub query failed');
    const assets = (body.data?.scrollAcrossLineage?.searchResults||[]).map(r=>({
      urn:r.entity.urn,
      type:r.entity.type,
      name:entityName(r.entity),
      platform:platformName(r.entity),
      owner:ownerName(r.entity),
      domain:'DataHub',
      tags:(r.entity.globalTags?.tags||[]).map(t=>t.tag?.name).filter(Boolean),
      degree:r.degree
    }));
    return { configured:true, assets, error:null };
  } catch (error) {
    return { configured:true, assets:null, error:error.message || 'DataHub query failed' };
  }
}

export function score(changeType, assets) {
  const breaking = BREAKING_CHANGE_TYPES.has(changeType);
  const critical = assets.filter(a=>a.tags.some(t=>/critical|pii|production|revenue|regulated|sensitive/i.test(t))).length;
  const ownerless = assets.filter(a=>!a.owner).length;
  const maxDegree = Math.max(0,...assets.map(a=>Number(String(a.degree).replace('+',''))||1));
  let value = 8 + assets.length*7 + critical*9 + ownerless*6 + maxDegree*4 + (breaking?22:0);
  if (breaking && assets.length === 0) value = Math.max(value, 30);
  value = Math.max(0,Math.min(100,value));
  const level=value>=80?'CRITICAL':value>=60?'HIGH':value>=35?'MEDIUM':'LOW';
  const decision=value>=80?'BLOCK':value>=60?'REVIEW':value>=35?'REVIEW':'ALLOW';
  return {value,level,decision,critical,ownerless,breaking,maxDegree};
}

function parseDatasetUrn(urn='') {
  const m = String(urn).match(/urn:li:dataset:\(urn:li:dataPlatform:([^,]+),([^,]+),([^\)]+)\)/);
  if (!m) return null;
  const [, platform, qualifiedName, env] = m;
  const parts = qualifiedName.split('.');
  return {platform, qualifiedName, env, table:parts.at(-1), namespace:parts.slice(0,-1).join('.')};
}

function parseRename(detail='', column='') {
  const arrow = String(detail).match(/([A-Za-z_][\w$]*)\s*(?:→|->|to)\s*([A-Za-z_][\w$]*)/i);
  if (arrow) return {oldColumn:arrow[1], newColumn:arrow[2]};
  return {oldColumn:column || 'old_column', newColumn:'new_column'};
}

export function generatedArtifacts({urn, changeType, detail, column, risk, assets}) {
  const parsed = parseDatasetUrn(urn);
  const rename = parseRename(detail, column);
  let contractTest;
  if (changeType === 'rename column' && parsed) {
    contractTest = `-- ChangeGuard compatibility test\n-- Run during the dual-write migration window before removing ${rename.oldColumn}.\nSELECT COUNT(*) AS mismatched_rows\nFROM ${parsed.qualifiedName}\nWHERE (${rename.oldColumn} <> ${rename.newColumn})\n   OR (${rename.oldColumn} IS NULL AND ${rename.newColumn} IS NOT NULL)\n   OR (${rename.oldColumn} IS NOT NULL AND ${rename.newColumn} IS NULL);\n-- Expected: mismatched_rows = 0`;
  } else if (parsed && column) {
    contractTest = `-- ChangeGuard pre-merge compile guard\n-- Confirms the current contract still exposes the field before a destructive migration.\nSELECT ${column}\nFROM ${parsed.qualifiedName}\nLIMIT 1;`;
  } else {
    contractTest = `-- ChangeGuard generated guard\n-- Validate the proposed schema against every degree-1 consumer before deployment.\n-- Source asset: ${urn}`;
  }

  const policy = {
    schemaVersion: 1,
    sourceUrn: urn,
    decision: risk.decision,
    riskScore: risk.value,
    riskLevel: risk.level,
    requiredApprovals: risk.critical > 0 ? ['governance','downstream-owners'] : (risk.ownerless > 0 ? ['data-platform'] : []),
    impactedUrns: assets.map(a=>a.urn),
  };

  return {
    contractTest,
    policyJson: JSON.stringify(policy,null,2),
    reviewSummary:`${risk.decision}: ${risk.level} risk (${risk.value}/100) — ${assets.length} downstream asset(s), ${risk.critical} governed/critical, ${risk.ownerless} ownerless.`
  };
}

export function buildDecision({urn, changeType='drop column', detail='', column='', assets=[], mode='live-datahub-mcp', liveError=null}) {
  const risk=score(changeType,assets);
  const actions=[
    ...(risk.ownerless?[`Assign ownership to ${risk.ownerless} downstream asset(s) before merge.`]:[]),
    ...(risk.critical?[`Require governance approval for ${risk.critical} critical / regulated downstream asset(s).`]:[]),
    ...(risk.decision==='BLOCK'?['Block the merge until required approvals and compatibility checks are complete.']:[]),
    'Run the generated contract test against the proposed schema before deployment.',
    ...(assets.length?['Notify owners of degree-1 and degree-2 dependencies.']:[]),
    'Persist the review outcome to DataHub so future agents inherit the decision.'
  ];
  const artifacts=generatedArtifacts({urn,changeType,detail,column,risk,assets});
  return {mode,liveError,urn,changeType,detail,column,risk,assets,actions,generatedArtifacts:artifacts,generatedAt:new Date().toISOString()};
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const {urn,changeType='drop column',detail='',column=''}=req.body||{};
  if(!urn || typeof urn !== 'string') return res.status(400).json({error:'urn is required'});

  try {
    const live = await queryDataHub(urn);
    let mode, assets, liveError=null;
    if (!live.configured) {
      mode='demo';
      assets=demoAssets;
    } else if (live.error) {
      mode='live-error-fallback';
      assets=demoAssets;
      liveError=live.error;
    } else {
      mode='live-datahub';
      assets=live.assets;
    }

    res.status(200).json(buildDecision({urn,changeType,detail,column,assets,mode,liveError}));
  } catch(e){res.status(500).json({error:e.message});}
}
