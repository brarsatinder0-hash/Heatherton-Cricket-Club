/**
 * Heatherton CC — GitHub OAuth login bridge for the /admin CMS
 * ------------------------------------------------------------------
 * WHY THIS EXISTS:
 * GitHub Pages can only serve static files — it can't run the
 * server-side step needed to securely log someone in with GitHub
 * (exchanging a login code for an access token requires a secret
 * that must never be visible in the browser). This tiny Worker does
 * just that one job, safely, so the /admin panel (Decap CMS) can use
 * "Login with GitHub".
 *
 * ------------------------------------------------------------------
 * SETUP — do this once:
 *
 * 1. Create a GitHub OAuth App:
 *    - Go to https://github.com/settings/developers -> "New OAuth App"
 *    - Application name: "Heatherton CC Admin" (or anything)
 *    - Homepage URL: your site's URL, e.g.
 *        https://www.heathertoncricketclub.com.au
 *    - Authorization callback URL: the Worker URL you'll get in step 3,
 *        with /callback on the end, e.g.
 *        https://heatherton-cms-auth.YOUR-SUBDOMAIN.workers.dev/callback
 *      (You'll need to deploy the Worker first to know this URL, then
 *       come back and fill this in — that's fine, just update it once.)
 *    - Click "Register application"
 *    - Copy the "Client ID", then click "Generate a new client secret"
 *      and copy that too — you'll need both in step 4.
 *
 * 2. Go to https://dash.cloudflare.com -> Workers & Pages -> Create
 *    -> "Create Worker". Name it e.g. "heatherton-cms-auth".
 *    Paste this whole file in, replacing the default code, and Deploy.
 *
 * 3. Note the Worker's URL (shown after deploying), e.g.
 *      https://heatherton-cms-auth.YOUR-SUBDOMAIN.workers.dev
 *    Go back to your GitHub OAuth App settings and set the
 *    Authorization callback URL to that URL + "/callback".
 *
 * 4. In the Worker's Settings -> Variables, add these two as
 *    encrypted secrets:
 *      GITHUB_CLIENT_ID
 *      GITHUB_CLIENT_SECRET
 *
 * 5. In admin/config.yml, set base_url to the Worker's URL from step 3.
 * ------------------------------------------------------------------
 */

function htmlResponse(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/html' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Step 1: Decap CMS opens this in a popup — send the visitor to GitHub to log in
    if (url.pathname === '/auth') {
      const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
      githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/callback`);
      githubAuthUrl.searchParams.set('scope', 'repo,user');
      return Response.redirect(githubAuthUrl.toString(), 302);
    }

    // Step 2: GitHub redirects back here with a one-time code
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return htmlResponse('<p>Missing authorization code.</p>');
      }

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code
        })
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return htmlResponse(`<p>Login failed: ${tokenData.error_description || 'unknown error'}</p>`);
      }

      // Hand the token back to the Decap CMS popup via postMessage, per its expected protocol
      const message = JSON.stringify({ token: tokenData.access_token, provider: 'github' });
      const script = `
        <script>
          (function(){
            function receiveMessage(e){
              window.opener.postMessage(
                'authorization:github:success:${message.replace(/"/g, '\\"')}',
                e.origin
              );
              window.removeEventListener('message', receiveMessage, false);
            }
            window.addEventListener('message', receiveMessage, false);
            window.opener.postMessage('authorizing:github', '*');
          })();
        </script>
        <p>Login successful — you can close this window.</p>
      `;
      return htmlResponse(script);
    }

    return htmlResponse('<p>Heatherton CC admin login bridge. Use this via the /admin panel, not directly.</p>');
  }
};
