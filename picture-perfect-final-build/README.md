# Picture Perfect

Clean rebuild of the Picture Perfect interactive photobooth website.

## Included

- Clean `index.html`, `styles.css`, and `script.js`
- Desktop and phone layouts
- Home, Camera, Drawing, About, Consent, Yes result, and No result screens
- Webcam access
- 3-second countdown
- Flash effect
- Drawing canvas with pencil, pen, and paint brush tools
- Color palette
- Brush size slider
- 30-second drawing timer
- Final image merge
- Download button
- Secure Google Drive upload route for the Yes flow
- Deployed OAuth helper routes for creating the Google refresh token

## How the Google Drive upload works

Visitors do **not** log into Google. The Yes button sends the final image to `/api/upload`, and the Vercel backend uploads it to your Google Drive folder using your private Google OAuth refresh token.

Your frontend never stores OAuth secrets.

## Vercel environment variables

Add these in Vercel: Project → Settings → Environment Variables → Production.

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token-after-oauth-setup
GOOGLE_DRIVE_FOLDER_ID=1xZlAj-5yUCqn0IGWbnJjA9vmJLekR2rx
OAUTH_SETUP_SECRET=make-any-private-random-phrase
GOOGLE_REDIRECT_URI=https://picture-perfect-theta.vercel.app/api/oauth-callback
```

After changing environment variables, redeploy the Vercel project.

## Google Cloud setup

In Google Cloud Console:

1. Enable **Google Drive API**.
2. Create an **OAuth Client ID**. Use **Web application**.
3. Add this Authorized JavaScript origin:

```text
https://picture-perfect-theta.vercel.app
```

4. Add this Authorized redirect URI exactly:

```text
https://picture-perfect-theta.vercel.app/api/oauth-callback
```

If your Vercel URL changes, update both Google Cloud and `GOOGLE_REDIRECT_URI` to the new exact URL.

## Getting the refresh token on the deployed site

After adding `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `OAUTH_SETUP_SECRET` in Vercel, redeploy.

Then visit this URL, replacing the secret with your real `OAUTH_SETUP_SECRET`:

```text
https://picture-perfect-theta.vercel.app/api/oauth-start?setup_secret=YOUR_OAUTH_SETUP_SECRET
```

Log into the Google account that owns or can access the Drive folder. After approving access, the callback page will show:

```env
GOOGLE_REFRESH_TOKEN=...
```

Copy that value into Vercel as `GOOGLE_REFRESH_TOKEN`, then redeploy again.

## Testing the Drive connection

Open:

```text
https://picture-perfect-theta.vercel.app/api/drive-test
```

If it returns `{ "ok": true }`, the Drive connection is working.

Then test the full website flow: take photo → draw → continue → Yes.

## Local fallback method

You can also get a refresh token locally:

1. In Google Cloud Console, add this Authorized redirect URI:

```text
http://localhost:3000/oauth2callback
```

2. Install dependencies:

```bash
npm install
```

3. Run:

```bash
GOOGLE_CLIENT_ID="your-client-id" GOOGLE_CLIENT_SECRET="your-client-secret" npm run get-refresh-token
```

4. Open the printed URL, allow access, then copy the printed `GOOGLE_REFRESH_TOKEN` into Vercel.

## Common fixes

- If Google says `redirect_uri_mismatch`, the Google Cloud Authorized redirect URI must exactly match `GOOGLE_REDIRECT_URI`.
- If `/api/drive-test` says a variable is missing, add it in Vercel Production environment variables and redeploy.
- If upload permission fails, make sure the OAuth Google account can access the folder in `GOOGLE_DRIVE_FOLDER_ID`.
- If Google does not return a refresh token, start again from `/api/oauth-start`. If needed, remove the app from your Google Account access page, then approve it again.

## Upload behavior

- Yes path: downloads the final merged image and uploads it to Google Drive through `/api/upload`.
- No path: does not upload. The user can still download the final image from the result page.
