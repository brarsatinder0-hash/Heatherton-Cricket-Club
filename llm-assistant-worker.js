/**
 * Heatherton CC — LLM-backed Club Assistant (Cloudflare Worker)
 * ------------------------------------------------------------------
 * WHY THIS EXISTS:
 * The site's Club Assistant widget already answers common questions
 * instantly using a built-in knowledge base — that part costs nothing
 * to run and needs no setup. This Worker is the OPTIONAL upgrade:
 * when a question doesn't match anything in the knowledge base, the
 * site can call this Worker instead, which asks a real AI model
 * (Claude) to answer using the club's facts as context.
 *
 * This needs an API key, which costs a small amount per use (usually
 * fractions of a cent per question for a club-sized site) — that's
 * why it's kept separate and optional rather than switched on by
 * default.
 *
 * ------------------------------------------------------------------
 * SETUP — do this once you're ready for this upgrade:
 *
 * 1. Get an API key from https://console.anthropic.com (sign up,
 *    add a small amount of credit, create an API key).
 *
 * 2. Go to https://dash.cloudflare.com -> Workers & Pages -> Create
 *    -> "Create Worker". Name it e.g. "heatherton-assistant".
 *    Paste this whole file in, replacing the default code, Deploy.
 *
 * 3. In the Worker's Settings -> Variables and Secrets, add:
 *      ANTHROPIC_API_KEY   (mark as Encrypt)
 *      ALLOWED_ORIGIN      (e.g. https://www.heathertoncricketclub.com.au)
 *
 * 4. Copy the Worker's URL (shown after deploying) and give it to
 *    Claude, or paste it into the site's JS yourself — replace
 *    LLM_ASSISTANT_URL near the top of the Club Assistant script in
 *    index.html with your real Worker URL.
 *
 * That's it — once that URL is set, the Club Assistant automatically
 * calls this Worker for anything its built-in knowledge base can't
 * answer confidently.
 * ------------------------------------------------------------------
 */

const CLUB_CONTEXT = `
You are the Club Assistant for Heatherton Cricket Club (Heatherton CC), a community cricket club
in Melbourne, Australia, founded in 1879. Answer questions warmly, briefly (2-4 sentences), and
only using the facts below. If you don't know something, say so plainly and suggest they use the
Contact form on the site — never invent details.

FACTS ABOUT THE CLUB:
- Founded 1879 as the "Heatherton Freighters" — one of Melbourne's oldest cricket clubs.
- Ground: 32-54 Ross St, Heatherton VIC 3202.
- Competes in Cricket Southern Bayside.
- Six teams: 4 senior men's teams (Saturday 1s, 2s and Sunday 1s, 2s), 1 women's team, 1 juniors team.
- Training: Tuesdays & Thursdays, 5:30 PM, 29 Sep 2026 to 15 Mar 2027, at Ross St Ground.
- Membership/registration is via PlayHQ (linked from the "Become a Member" button on the site).
- Yearly subs are paid via a Stripe payment link (the "Pay Your Yearly Subs" button).
- Executive Committee: Nitin Gupta, Satinder Brar, Indresh Brar, Glenn McLean (VP & Child Safety
  Officer), Ray Jopling, Gokul Vasudevan.
- Team captains: Mani Bola (Saturday 1s), Gokul Vasudevan (Saturday 2s), Neeraj Raghav (Sunday 1s),
  Arun & Ajay (Sunday 2s, co-captains).
- Life Members: Alex Parr and Luke Sullivan (2022), Nitin Gupta (2026).
- Sponsors: Bendigo Bank, Advantage Group, 50 Acres RSL Cheltenham, My Therapy Group, Silver Sponge,
  RMBL, Gunpowder Social, Inverloch Motel, Sidhu Legal. Supported by Kingston City Council, Monash
  University, Heatherton Netball & Football Club.
- Function room hire is available — enquire via the Contact form.
- Club shop: niscsports.com.au/heathertoncc-shop
- Contact email: cricketclubheatherton@gmail.com
`.trim();

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
    }

    try {
      const { message } = await request.json();
      if (!message || typeof message !== 'string' || message.length > 500) {
        return new Response(JSON.stringify({ error: 'Invalid message' }), { status: 400, headers });
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          // Haiku is Anthropic's fastest, cheapest model — a good fit for short,
          // factual club Q&A. Swap to a different model string if you want more.
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: CLUB_CONTEXT,
          messages: [{ role: 'user', content: message }]
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ error: 'AI request failed', detail: errText }), { status: 502, headers });
      }

      const data = await res.json();
      const answer = data.content?.[0]?.text || "Sorry, I couldn't come up with an answer to that.";

      return new Response(JSON.stringify({ answer }), { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }
};
