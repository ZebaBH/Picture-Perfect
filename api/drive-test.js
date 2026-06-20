import { google } from 'googleapis';

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getEnv(name, { required = true } = {}) {
  const value = process.env[name];
  if (required && !value) {
    const error = new Error(`Missing Vercel environment variable: ${name}`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function createDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    getEnv('GOOGLE_CLIENT_ID'),
    getEnv('GOOGLE_CLIENT_SECRET'),
    getEnv('GOOGLE_REDIRECT_URI', { required: false })
  );

  oauth2Client.setCredentials({
    refresh_token: getEnv('GOOGLE_REFRESH_TOKEN'),
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

function publicErrorMessage(error) {
  const message = error?.errors?.[0]?.message || error?.response?.data?.error_description || error?.message;

  if (/invalid_grant/i.test(message || '')) {
    return 'Google refresh token is invalid or expired. Generate a new GOOGLE_REFRESH_TOKEN.';
  }

  if (/insufficient|permission|not found|File not found/i.test(message || '')) {
    return 'Google Drive permission failed. Check GOOGLE_DRIVE_FOLDER_ID and make sure the OAuth Google account can access that folder.';
  }

  return message || 'Drive test failed.';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed. Use GET.' });
  }

  try {
    const drive = createDriveClient();
    const folderId = getEnv('GOOGLE_DRIVE_FOLDER_ID');
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 5,
      fields: 'files(id,name,mimeType,createdTime)',
      orderBy: 'createdTime desc',
    });

    return send(res, 200, {
      ok: true,
      folderId,
      files: response.data.files || [],
    });
  } catch (error) {
    console.error('Drive test failed:', error);
    return send(res, error.statusCode || error.code || 500, {
      ok: false,
      error: publicErrorMessage(error),
    });
  }
}
