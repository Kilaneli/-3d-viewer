import { initViewer, loadArrayBuffer } from './viewer.js';
import { initAuth, downloadFile, openFilePicker } from './drive.js';

const $status      = document.getElementById('status');
const $statusText  = document.getElementById('status-text');
const $btnOpen     = document.getElementById('btn-open');
const $btnOpenLocal = document.getElementById('btn-open-local');
const $fileInput   = document.getElementById('file-input');
const $btnDl       = document.getElementById('btn-download');

function showStatus(msg, type = 'loading') {
  $status.className = type;
  $statusText.textContent = msg;
}

function hideStatus() {
  $status.className = 'hidden';
}

async function loadFromDrive(fileId) {
  showStatus('Connecting to Google Drive…');
  try {
    const { name, buffer } = await downloadFile(fileId);

    showStatus(`Loading ${name}…`);
    document.title = `${name} — 3D Viewer`;

    // Blob URL for the download button
    const blob = new Blob([buffer]);
    const blobUrl = URL.createObjectURL(blob);
    $btnDl.href     = blobUrl;
    $btnDl.download = name;
    $btnDl.classList.remove('hidden');

    await loadArrayBuffer(buffer, name);
    hideStatus();
  } catch (err) {
    showStatus(err.message, 'error');
    console.error(err);
  }
}

async function loadFromLocalFile(file) {
  showStatus(`Loading ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    document.title = `${file.name} — 3D Viewer`;

    const blobUrl = URL.createObjectURL(file);
    $btnDl.href     = blobUrl;
    $btnDl.download = file.name;
    $btnDl.classList.remove('hidden');

    await loadArrayBuffer(buffer, file.name);
    hideStatus();
  } catch (err) {
    showStatus(err.message, 'error');
    console.error(err);
  }
}

async function main() {
  showStatus('Initializing…');

  initViewer(document.getElementById('canvas'));

  $btnOpenLocal.classList.remove('hidden');
  $btnOpenLocal.addEventListener('click', () => $fileInput.click());
  $fileInput.addEventListener('change', async () => {
    const file = $fileInput.files[0];
    $fileInput.value = '';
    if (file) await loadFromLocalFile(file);
  });

  try {
    await initAuth();
  } catch (err) {
    // Local file opening still works without Google auth configured.
    hideStatus();
    return;
  }

  // Google Drive calls our app with ?state={"ids":["..."],"action":"open",...}
  const stateParam = new URLSearchParams(location.search).get('state');
  if (stateParam) {
    try {
      const state = JSON.parse(decodeURIComponent(stateParam));
      if (state.action === 'open' && Array.isArray(state.ids) && state.ids.length) {
        await loadFromDrive(state.ids[0]);
        $btnOpen.classList.remove('hidden'); // let user open another file
        return;
      }
    } catch {
      showStatus('Invalid Drive state parameter', 'error');
      return;
    }
  }

  // No state param — show the Open button
  hideStatus();
  $btnOpen.classList.remove('hidden');

  $btnOpen.addEventListener('click', async () => {
    $btnOpen.disabled = true;
    try {
      const fileId = await openFilePicker();
      if (fileId) await loadFromDrive(fileId);
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      $btnOpen.disabled = false;
    }
  });
}

main();
