import { google } from 'googleapis';

const DEFAULT_REDIRECT_PATH = '/api/oauth-callback';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

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
    const providedSecret = req.query?.setup_secret || req.query?.secret;

    if (providedSecret !== setupSecret) {
      return sendHtml(res, 403, '<h1>OAuth setup locked</h1><p>Add <code>?setup_secret=YOUR_OAUTH_SETUP_SECRET</code> to this URL.</p>');
    }

    const oauth2Client = new google.auth.OAuth2(
      getEnv('GOOGLE_CLIENT_ID'),
      getEnv('GOOGLE_CLIENT_SECRET'),
      getRedirectUri(req)
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: setupSecret,
    });

    res.statusCode = 302;
    res.setHeader('Location', authUrl);
    res.end();
  } catch (error) {
    return sendHtml(
      res,
      500,
      `<h1>OAuth setup error</h1><p>${String(error.message || error).replace(/[<>]/g, '')}</p>`
    );
  }
}
