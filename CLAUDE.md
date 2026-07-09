# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static web app that acts as a Google Drive "Open With" handler for 3D model files (STL, OBJ, GLB, GLTF). No build step, no npm — everything runs directly in the browser using ES modules with an importmap.

To develop locally, serve the files over HTTP (not `file://` — ES modules and Google OAuth both require a real origin):

```
npx serve .
# or
python -m http.server 8080
```

Google OAuth will only work if the origin matches an Authorized JavaScript Origin in Google Cloud Console. For local dev, add `http://localhost:8080` there.

## Architecture

Three ES modules, each with a single responsibility:

**`js/drive.js`** — All Google API interaction:
- `initAuth()` — waits for the GIS script to load (`window._gisPromise`), then initialises a token client with `drive.readonly` scope
- `downloadFile(fileId)` → `{ name, buffer }` — fetches metadata + raw bytes via Drive REST API v3
- `openFilePicker()` — waits for gapi (`window._gapiPromise`), loads the Picker widget, resolves with a file ID

**`js/viewer.js`** — Three.js scene (module-level singletons: `scene`, `camera`, `renderer`, `controls`):
- `initViewer(canvas)` — sets up scene, lighting, grid, OrbitControls, starts the render loop
- `loadArrayBuffer(buffer, filename)` — dispatches by extension to STLLoader / OBJLoader / GLTFLoader; calls `fitCameraToObject()` to auto-frame the model

**`js/app.js`** — Entry point:
- On load: checks `?state=` URL param (injected by Google Drive); if present, calls `loadFromDrive(fileId)` immediately
- Otherwise: shows the "Open File from Google Drive" button
- Both paths converge on `loadFromDrive()` which calls `downloadFile` → `loadArrayBuffer`

## External Script Loading

Two Google scripts are loaded asynchronously in `index.html`. Promises stored on `window` bridge the async load to the ES modules:

```
window._gapiPromise  ← resolves when apis.google.com/js/api.js loads  (needed for Picker)
window._gisPromise   ← resolves when accounts.google.com/gsi/client loads (needed for OAuth)
```

Three.js is resolved via `<script type="importmap">` pointing to jsDelivr CDN (version 0.168.0).

## Credentials

`js/drive.js` exports `CLIENT_ID` and `API_KEY` as plain constants — replace the placeholder strings before deploying:

```js
export const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
export const API_KEY   = 'YOUR_API_KEY';
```

Required Google Cloud setup: enable **Google Drive API** + **Google Picker API**, create an OAuth 2.0 Web Client ID and an unrestricted API Key, add the deployment origin to Authorized JavaScript Origins.

## Google Drive "Open With" Registration

After deploying to GitHub Pages, register in Google Cloud Console → **APIs & Services → Drive SDK**:
- Open URL: `https://<username>.github.io/<repo>/?state={ids}&action=open`
- MIME types: `model/stl`, `application/sla`, `model/obj`, `model/gltf-binary`, `model/gltf+json`

This makes Drive show the app in the "Open with" menu when a user clicks a supported file.

## Deployment

The repo is a GitHub Pages static site. Push to `main` and Pages serves `index.html` at the root. No CI, no build.
