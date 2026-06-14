import { google } from 'googleapis';

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function createDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET')
  );

  oauth2Client.setCredentials({
    refresh_token: requireEnv('GOOGLE_REFRESH_TOKEN'),
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const drive = createDriveClient();
    const folderId = requireEnv('GOOGLE_DRIVE_FOLDER_ID');
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 5,
      fields: 'files(id,name,mimeType,createdTime)',
    });

    return send(res, 200, {
      ok: true,
      folderId,
      files: response.data.files || [],
    });
  } catch (error) {
    console.error('Drive test failed:', error);
    return send(res, 500, {
      ok: false,
      error: error.message || 'Drive test failed.',
    });
  }
}
