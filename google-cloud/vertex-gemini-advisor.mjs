const DEFAULT_MODEL = 'gemini-2.5-flash';

function extractText(body) {
  return (body?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function vertexConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_OAUTH_ACCESS_TOKEN);
}

export function buildAdvisorPrompt(decision) {
  const impacted = (decision.assets || []).slice(0, 12).map(asset => ({
    urn: asset.urn,
    name: asset.name,
    owner: asset.owner || null,
    tags: asset.tags || [],
    degree: asset.degree,
  }));

  return [
    'You are ChangeGuard, a production data-change remediation agent.',
    'The deterministic policy engine below is authoritative. Never override its ALLOW/REVIEW/BLOCK decision.',
    'Produce a concise operator plan with: (1) the top 3 remediation steps, (2) owners/teams to involve when known, and (3) one rollback safeguard.',
    'Do not invent owners, approvals, incidents, customer facts, or metrics. If evidence is missing, say so.',
    '',
    JSON.stringify({
      change: {
        urn: decision.urn,
        changeType: decision.changeType,
        detail: decision.detail,
        column: decision.column,
      },
      policy: decision.risk,
      impacted,
      deterministicActions: decision.actions,
    }, null, 2),
  ].join('\n');
}

export async function getVertexGeminiAdvisory(decision, {
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (!vertexConfigured(env)) {
    return {
      configured: false,
      provider: 'Google Cloud Vertex AI',
      model: env.VERTEX_GEMINI_MODEL || DEFAULT_MODEL,
      text: null,
      error: null,
    };
  }

  const project = env.GOOGLE_CLOUD_PROJECT;
  const location = env.GOOGLE_CLOUD_LOCATION || 'global';
  const model = env.VERTEX_GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.GOOGLE_OAUTH_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: buildAdvisorPrompt(decision) }],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Vertex AI ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }

    const body = await response.json();
    const text = extractText(body);
    if (!text) throw new Error('Vertex AI returned no advisory text');

    return {
      configured: true,
      provider: 'Google Cloud Vertex AI',
      model,
      text,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      provider: 'Google Cloud Vertex AI',
      model,
      text: null,
      error: error?.message || 'Vertex AI request failed',
    };
  }
}
