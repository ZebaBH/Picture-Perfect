import { google } from 'googleapis';
import { Readable } from 'node:stream';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, allowedMethod) {
  res.setHeader('Allow', allowedMethod);
  return send(res, 405, { ok: false, error: `Method not allowed. Use ${allowedMethod}.` });
}

function getEnv(name, { required = true } = {}) {
  const value = process.env[name];
  if (required && !value) {
    const error = new Error(`Missing Vercel environment variable: ${name}`);
    error.statusCode = 500;
    error.publicMessage = `Server setup is incomplete. Missing ${name} in Vercel Environment Variables.`;
    throw error;
  }
  return value;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function parseImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    const error = new Error('Missing imageData.');
    error.statusCode = 400;
    throw error;
  }

  const match = imageData.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    const error = new Error('imageData must be a PNG, JPEG, or WEBP data URL.');
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
  const buffer = Buffer.from(match[3], 'base64');

  if (!buffer.length) {
    const error = new Error('Image data is empty.');
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > MAX_BODY_BYTES) {
    const error = new Error('Image file is too large.');
    error.statusCode = 413;
    throw error;
  }

  return { buffer, mimeType, extension };
}

function safeFilename(filename, extension) {
  const fallback = `picture-perfect-${Date.now()}.${extension}`;
  const cleaned = String(filename || fallback)
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || fallback;
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
  if (error.publicMessage) return error.publicMessage;

  const googleMessage = error?.errors?.[0]?.message || error?.response?.data?.error_description || error?.message;

  if (/invalid_grant/i.test(googleMessage || '')) {
    return 'Google refresh token is invalid or expired. Generate a new GOOGLE_REFRESH_TOKEN.';
  }

  if (/insufficient|permission|not found|File not found/i.test(googleMessage || '')) {
    return 'Google Drive upload permission failed. Check GOOGLE_DRIVE_FOLDER_ID and make sure the Google account used for OAuth can access that folder.';
  }

  return googleMessage || 'Upload failed.';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  try {
    const body = await readJsonBody(req);
    const { buffer, mimeType, extension } = parseImageData(body.imageData);
    const filename = safeFilename(body.filename, extension);

    const drive = createDriveClient();
    const folderId = getEnv('GOOGLE_DRIVE_FOLDER_ID');

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: 'id,name,webViewLink,webContentLink',
    });

    return send(res, 200, {
      ok: true,
      file: response.data,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return send(res, error.statusCode || error.code || 500, {
      ok: false,
      error: publicErrorMessage(error),
    });
  }
}
