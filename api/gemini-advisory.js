import { getVertexGeminiAdvisory } from '../google-cloud/vertex-gemini-advisor.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const decision = req.body?.decision;
  if (!decision || !decision.urn || !decision.risk || !Array.isArray(decision.assets)) {
    return res.status(400).json({ error: 'decision with urn, risk, and assets is required' });
  }

  const advisory = await getVertexGeminiAdvisory(decision);
  if (!advisory.configured) {
    return res.status(503).json({
      ...advisory,
      error: 'Vertex AI is not configured. Set GOOGLE_CLOUD_PROJECT and GOOGLE_OAUTH_ACCESS_TOKEN.',
    });
  }

  return res.status(advisory.error ? 502 : 200).json(advisory);
}
