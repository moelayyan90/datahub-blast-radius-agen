const TAG_ID = 'changeguard-reviewed';
const TAG_URN = `urn:li:tag:${TAG_ID}`;

function headers() {
  return {
    'content-type': 'application/json',
    ...(process.env.DATAHUB_TOKEN ? { authorization: `Bearer ${process.env.DATAHUB_TOKEN}` } : {}),
  };
}

async function graph(query, variables = {}) {
  const base = process.env.DATAHUB_GMS_URL;
  if (!base) throw new Error('DATAHUB_GMS_URL is not configured');
  const response = await fetch(base.replace(/\/$/, '') + '/api/graphql', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`DataHub GraphQL ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) {
    const error = new Error(body.errors.map((e) => e.message).join('; '));
    error.graphql = body.errors;
    throw error;
  }
  return body.data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { urn, riskLevel = 'UNKNOWN', score = null, changeType = '', detail = '' } = req.body || {};
  if (!urn) return res.status(400).json({ error: 'urn is required' });

  const note = `ChangeGuard review: ${riskLevel}${score == null ? '' : ` (${score}/100)`}; ${changeType}${detail ? ` — ${detail}` : ''}`;

  if (!process.env.DATAHUB_GMS_URL) {
    return res.status(200).json({
      mode: 'demo-preview',
      persisted: false,
      tagUrn: TAG_URN,
      note,
      message: 'Preview only: configure DATAHUB_GMS_URL to persist this review tag to DataHub.',
    });
  }

  try {
    try {
      await graph(`mutation EnsureChangeGuardTag {
        createTag(input: {
          id: "${TAG_ID}",
          name: "ChangeGuard Reviewed",
          description: "Asset has been evaluated by ChangeGuard before a proposed production data change."
        })
      }`);
    } catch (error) {
      const msg = String(error.message || '').toLowerCase();
      if (!/exist|already|duplicate/.test(msg)) throw error;
    }

    const data = await graph(
      `mutation PersistChangeGuardReview($urn: String!) {
        addTags(input: { tagUrns: ["${TAG_URN}"], resourceUrn: $urn })
      }`,
      { urn },
    );

    return res.status(200).json({
      mode: 'live-datahub',
      persisted: Boolean(data?.addTags),
      tagUrn: TAG_URN,
      note,
      message: data?.addTags
        ? 'Review marker written back to DataHub.'
        : 'DataHub accepted the mutation but did not confirm addTags=true.',
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'DataHub write-back failed' });
  }
}
