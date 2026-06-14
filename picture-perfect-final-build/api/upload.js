import { google } from 'googleapis';
import { Readable } from 'node:stream';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

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
    throw new Error('Missing imageData.');
  }

  const match = imageData.match(/^data:(image\/(png|jpeg|jpg));base64,(.+)$/i);
  if (!match) {
    throw new Error('imageData must be a PNG or JPEG data URL.');
  }

  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const buffer = Buffer.from(match[3], 'base64');

  if (!buffer.length) throw new Error('Image data is empty.');
  if (buffer.length > MAX_BODY_BYTES) throw new Error('Image file is too large.');

  return { buffer, mimeType, extension };
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const body = await readJsonBody(req);
    const { buffer, mimeType, extension } = parseImageData(body.imageData);
    const safeName = String(body.filename || `picture-perfect-${Date.now()}.${extension}`)
      .replace(/[^a-z0-9._-]/gi, '-')
      .replace(/-+/g, '-');

    const drive = createDriveClient();
    const folderId = requireEnv('GOOGLE_DRIVE_FOLDER_ID');

    const response = await drive.files.create({
      requestBody: {
        name: safeName,
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
    return send(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Upload failed.',
    });
  }
}
