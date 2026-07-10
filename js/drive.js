// ─────────────────────────────────────────────────────────────────────────────
// SETUP: Replace these two values with your Google Cloud Console credentials.
//   1. CLIENT_ID  → APIs & Services → Credentials → OAuth 2.0 Client ID
//   2. API_KEY    → APIs & Services → Credentials → API Key
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENT_ID = '949829535928-28kee3kg5a4m9q1h0c0i6kg04ut5rlmp.apps.googleusercontent.com';
export const API_KEY   = 'AIzaSyB3u9s_Pqz2coGoi0ijaa9EM8qUd5AIcuU';

// drive.file: access only to files the user explicitly opens/picks via this app.
// Avoids the "Restricted" scope classification (and paid CASA security assessment)
// that drive.readonly would require for public OAuth verification.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Google Cloud project number (the numeric prefix of CLIENT_ID, before the
// first "-"). Required by Picker so that selecting a file actually grants
// this app drive.file access to it — without it, selection succeeds
// visually but the app has no real access and later API calls 404.
const APP_ID = CLIENT_ID.split('-')[0];

const MIME_TYPES = [
  'model/stl',
  'application/sla',
  'application/vnd.ms-pki.stl',
  'model/obj',
  'application/obj',
  'model/gltf-binary',
  'model/gltf+json',
].join(',');

let tokenClient;
let accessToken = null;

export async function initAuth() {
  await window._gisPromise;

  if (CLIENT_ID === 'YOUR_CLIENT_ID.apps.googleusercontent.com') {
    throw new Error(
      'Google Client ID not configured.\n' +
      'Open js/drive.js and replace CLIENT_ID and API_KEY with your credentials.\n' +
      'See: console.cloud.google.com'
    );
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {},
  });
}

function requestToken() {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      accessToken = resp.access_token;
      resolve(accessToken);
    };
    // Skip consent screen on subsequent calls if we already have a token
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

async function ensureToken() {
  if (!accessToken) await requestToken();
  return accessToken;
}

export async function downloadFile(fileId) {
  const token = await ensureToken();

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) throw new Error(`Drive API error ${metaRes.status}: ${await metaRes.text()}`);
  const { name } = await metaRes.json();

  const fileRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!fileRes.ok) throw new Error(`Download error ${fileRes.status}: ${await fileRes.text()}`);

  const buffer = await fileRes.arrayBuffer();
  return { name, buffer };
}

export async function openFilePicker() {
  const token = await ensureToken();
  await window._gapiPromise;

  return new Promise((resolve) => {
    gapi.load('picker', () => {
      const view = new google.picker.DocsView()
        .setMimeTypes(MIME_TYPES)
        .setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY)
        .setAppId(APP_ID)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) resolve(data.docs[0].id);
          if (data.action === google.picker.Action.CANCEL)  resolve(null);
        })
        .build();

      picker.setVisible(true);
    });
  });
}
