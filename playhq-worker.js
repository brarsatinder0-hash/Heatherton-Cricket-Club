/**
 * Heatherton CC — PlayHQ API proxy (Cloudflare Worker)
 * ------------------------------------------------------------------
 * WHY THIS EXISTS:
 * PlayHQ's API requires a secret Client ID/Secret (or an API key).
 * That secret can NEVER live in the website's JavaScript — anyone
 * could open dev tools and steal it. This Worker holds the secret
 * safely on Cloudflare's side, talks to PlayHQ on the site's behalf,
 * and only ever returns plain fixture/ladder data to the browser.
 *
 * The website's fetch() calls should point at THIS worker's URL,
 * never directly at api.playhq.com.
 *
 * ------------------------------------------------------------------
 * SETUP — do this once you have real PlayHQ credentials:
 *
 * 1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create
 *    -> "Create Worker". Give it a name, e.g. "heatherton-playhq".
 * 2. Paste this entire file into the editor, replacing the default
 *    code, then click "Deploy".
 * 3. Go to the Worker's Settings -> Variables -> "Add variable" for
 *    each of these, marking each as "Encrypt" (so it's a secret,
 *    not plain text):
 *
 *      PLAYHQ_CLIENT_ID       (if PlayHQ issued Client ID/Secret)
 *      PLAYHQ_CLIENT_SECRET
 *      PLAYHQ_API_KEY         (if PlayHQ issued an x-api-key instead)
 *      PLAYHQ_TENANT          (e.g. "cricket-australia" — PlayHQ will tell you)
 *      PLAYHQ_ORG_ID          Already known for Heatherton CC:
 *                             5f727dd2-cae4-49c1-a964-561a18fa95b1
 *      PLAYHQ_GRADE_ID        (the grade/team's UUID for ladder lookups —
 *                             still needs discovering, see step 4 below)
 *      ALLOWED_ORIGIN         (https://www.heathertoncricketclub.com.au)
 *
 *    You may only need ONE of the two credential pairs above,
 *    depending on which type PlayHQ issues you — use whichever
 *    applies and leave the other blank.
 *
 * 4. FINDING YOUR GRADE ID: the organisation ID above is confirmed,
 *    but the grade/team ID for the ladder still needs discovering.
 *    Once you have credentials, call:
 *      GET /v1/organisations/5f727dd2-cae4-49c1-a964-561a18fa95b1/seasons
 *      GET /v1/seasons/{id}/teams
 *      GET /v1/seasons/{id}/grades
 *    to drill down to the exact team/grade UUID you want to show,
 *    then set PLAYHQ_GRADE_ID to that value.
 *
 * 5. After deploying, you'll get a URL like:
 *      https://heatherton-playhq.<your-subdomain>.workers.dev
 *    Give that URL to Claude (or paste it into the site's JS
 *    yourself) so the website can call:
 *      /fixtures  -> upcoming/recent games
 *      /ladder    -> current ladder
 * ------------------------------------------------------------------
 */

const PLAYHQ_BASE = 'https://api.playhq.com';
const HEATHERTON_ORG_ID = '5f727dd2-cae4-49c1-a964-561a18fa95b1'; // confirmed org ID, used as fallback below

// Simple in-memory token cache (persists for the life of this Worker instance)
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getBearerToken(env) {
  const now = Date.now() / 1000;
  if (cachedToken && cachedTokenExpiry > now + 30) {
    return cachedToken;
  }
  const res = await fetch(`${PLAYHQ_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: env.PLAYHQ_CLIENT_ID,
      clientSecret: env.PLAYHQ_CLIENT_SECRET
    })
  });
  if (!res.ok) throw new Error(`PlayHQ auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = data.exp;
  return cachedToken;
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

async function handleFixtures(env) {
  // Organisation games by date range — works for cricket, unlike /teams/{id}/fixture
  const token = await getBearerToken(env);
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const future = new Date(today);
  future.setDate(future.getDate() + 60);
  const end = future.toISOString().slice(0, 10);

  const url = `${PLAYHQ_BASE}/partner/v2/organisations/${env.PLAYHQ_ORG_ID || HEATHERTON_ORG_ID}/games?startDate=${start}&endDate=${end}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`PlayHQ games fetch failed: ${res.status}`);
  return res.json();
}

async function handleLadder(env) {
  // Grade ladder — uses the x-api-key / x-phq-tenant auth scheme, not Bearer
  const url = `${PLAYHQ_BASE}/v2/grades/${env.PLAYHQ_GRADE_ID}/ladder`;
  const res = await fetch(url, {
    headers: {
      'x-api-key': env.PLAYHQ_API_KEY,
      'x-phq-tenant': env.PLAYHQ_TENANT
    }
  });
  if (!res.ok) throw new Error(`PlayHQ ladder fetch failed: ${res.status}`);
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      if (url.pathname === '/fixtures') {
        const data = await handleFixtures(env);
        return new Response(JSON.stringify(data), { headers });
      }
      if (url.pathname === '/ladder') {
        const data = await handleLadder(env);
        return new Response(JSON.stringify(data), { headers });
      }
      return new Response(JSON.stringify({ error: 'Not found. Try /fixtures or /ladder.' }), {
        status: 404,
        headers
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers
      });
    }
  }
};
