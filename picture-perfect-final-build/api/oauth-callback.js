import { google } from 'googleapis';

const DEFAULT_REDIRECT_PATH = '/api/oauth-callback';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

function getBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Vercel environment variable: ${name}`);
  return value;
}

function getRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}${DEFAULT_REDIRECT_PATH}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendHtml(res, 405, '<h1>Method not allowed</h1><p>Use GET.</p>');
    }

    const setupSecret = getEnv('OAUTH_SETUP_SECRET');
    const { code, error, state } = req.query || {};

    if (error) throw new Error(`Google returned an OAuth error: ${error}`);
    if (state !== setupSecret) throw new Error('OAuth setup secret did not match. Start again from /api/oauth-start.');
    if (!code) throw new Error('Missing authorization code from Google.');

    const oauth2Client = new google.auth.OAuth2(
      getEnv('GOOGLE_CLIENT_ID'),
      getEnv('GOOGLE_CLIENT_SECRET'),
      getRedirectUri(req)
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Visit /api/oauth-start again. Make sure prompt=consent is used and try removing old app access from your Google Account first.');
    }

    return sendHtml(
      res,
      200,
      `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Picture Perfect OAuth Setup</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 18px; line-height: 1.5; }
            code, pre { background: #f5f2ea; border-radius: 8px; }
            pre { padding: 14px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
            .warn { color: #8a2d00; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>Refresh token created</h1>
          <p>Copy this into Vercel as <strong>GOOGLE_REFRESH_TOKEN</strong>:</p>
          <pre>GOOGLE_REFRESH_TOKEN=${escapeHtml(tokens.refresh_token)}</pre>
          <p class="warn">Keep this private. Do not paste it into frontend JavaScript or GitHub.</p>
          <p>After saving it in Vercel, redeploy the site. Then test <code>/api/drive-test</code>.</p>
        </body>
      </html>`
    );
  } catch (error) {
    return sendHtml(
      res,
      500,
      `<h1>OAuth callback error</h1><p>${escapeHtml(error.message || error)}</p><p>Check that the Authorized redirect URI in Google Cloud exactly matches <code>${escapeHtml(getRedirectUri(req))}</code>.</p>`
    );
  }
}
