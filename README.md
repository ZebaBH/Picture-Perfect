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

## Fonts

The project expects these files in `assets/fonts/`:

- `Awesome-Lathusca.ttf`
- `Poppins-Regular.otf`
- `Poppins-SemiBold.otf`

Copy them from your original uploaded asset ZIP into `assets/fonts/` before deploying.

## Google Drive setup

The frontend never stores OAuth secrets. Uploads go through `/api/upload`.

Set these Vercel environment variables:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=1xZlAj-5yUCqn0IGWbnJjA9vmJLekR2rx
```

## Getting a refresh token

1. In Google Cloud Console, create an OAuth client.
2. Add this Authorized redirect URI:

```text
http://localhost:3000/oauth2callback
```

3. Install dependencies:

```bash
npm install
```

4. Run:

```bash
GOOGLE_CLIENT_ID="your-client-id" GOOGLE_CLIENT_SECRET="your-client-secret" npm run get-refresh-token
```

5. Open the printed URL, allow access, then copy the printed `GOOGLE_REFRESH_TOKEN` into Vercel.

## Testing locally

```bash
npm install
vercel dev
```

Open the local URL shown by Vercel.

Camera access requires HTTPS in production. Localhost is allowed by browsers for testing.

## Upload behavior

- Yes path: downloads the final merged image and uploads it to Google Drive through `/api/upload`.
- No path: does not upload. The user can still download the final image from the result page.
