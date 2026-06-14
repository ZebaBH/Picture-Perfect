import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
const PORT = Number(process.env.OAUTH_PORT || 3000);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this tool.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

console.log('\nBefore running this, add this Authorized redirect URI in Google Cloud:');
console.log(REDIRECT_URI);
console.log('\nThen open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for OAuth callback...\n');

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, REDIRECT_URI);

    if (requestUrl.pathname !== '/oauth2callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');

    if (error) throw new Error(error);
    if (!code) throw new Error('Missing authorization code.');

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Refresh token created</h1><p>You can close this window and return to your terminal.</p>');

    console.log('\nAdd this to Vercel Environment Variables:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nKeep it secret. Do not paste it into frontend JavaScript.\n');

    server.close(() => process.exit(0));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('OAuth failed. Check the terminal.');
    console.error('Could not exchange code for token:', err.message);
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, () => {
  console.log(`OAuth helper listening on ${REDIRECT_URI}`);
});
