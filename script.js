const DESKTOP_ARTBOARD = { width: 1440, height: 1024 };
const MOBILE_ARTBOARD = { width: 402, height: 874 };
const mobileArtboardQuery = window.matchMedia('(max-width: 640px)');
let artboardScaleRaf = null;

function getActiveArtboardSize() {
  return mobileArtboardQuery.matches ? MOBILE_ARTBOARD : DESKTOP_ARTBOARD;
}

function updateArtboardScale() {
  const { width, height } = getActiveArtboardSize();
  const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
  document.documentElement.style.setProperty('--artboard-scale', String(Math.max(scale, 0.001)));
}

function scheduleArtboardScaleUpdate() {
  if (artboardScaleRaf) cancelAnimationFrame(artboardScaleRaf);
  artboardScaleRaf = requestAnimationFrame(() => {
    artboardScaleRaf = null;
    updateArtboardScale();
  });
}

updateArtboardScale();
window.addEventListener('resize', scheduleArtboardScaleUpdate, { passive: true });
window.addEventListener('orientationchange', scheduleArtboardScaleUpdate, { passive: true });
mobileArtboardQuery.addEventListener?.('change', scheduleArtboardScaleUpdate);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleArtboardScaleUpdate, { passive: true });
  window.visualViewport.addEventListener('scroll', scheduleArtboardScaleUpdate, { passive: true });
}

const screens = [...document.querySelectorAll('[data-screen]')];
const validScreens = new Set(screens.map((screen) => screen.dataset.screen));

const video = document.querySelector('.camera-video');
const captureCanvas = document.querySelector('.capture-canvas');
const countdownEl = document.querySelector('.camera-countdown');
const flashEl = document.querySelector('.camera-flash');
const drawingCanvas = document.querySelector('.drawing-canvas');
const capturedPreview = document.querySelector('.captured-preview');
const finalPhotoEls = document.querySelectorAll('.final-photo');
const timerEls = document.querySelectorAll('.timer-frame span');
const uploadStatus = document.querySelector('.upload-status');

const PHOTO_WIDTH = 716;
const PHOTO_HEIGHT = 446;
const UPLOAD_ENDPOINT = '/api/upload';

let stream = null;
let activeTool = 'paint';
let activeColor = '#C90000';
let isDrawing = false;
let timerId = null;
let secondsLeft = 30;
let drawingStarted = false;
let yesFlowBusy = false;

function screenFromHash() {
  const hash = location.hash.replace('#', '');
  return validScreens.has(hash) ? hash : 'home';
}

function setScreen(name) {
  document.body.dataset.currentScreen = name;
  screens.forEach((screen) => {
    const active = screen.dataset.screen === name;
    screen.classList.toggle('is-hidden', !active);
    screen.setAttribute('aria-hidden', String(!active));
  });

  if (name === 'camera') {
    startCamera();
  } else {
    stopCamera();
  }

  if (name === 'drawing') initDrawing();
  if (name === 'about') loadFinalImage();
}

function go(name) {
  const hash = name === 'home' ? '' : name;
  if (location.hash.replace('#', '') !== hash) {
    location.hash = hash;
  }
  setScreen(name);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startCamera() {
  if (stream || !navigator.mediaDevices?.getUserMedia) return;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    if (video) {
      video.srcObject = stream;
      await video.play();
    }
  } catch (error) {
    console.warn('Camera unavailable:', error);
    if (countdownEl) countdownEl.textContent = 'Camera blocked';
    await wait(1200);
    if (countdownEl) countdownEl.textContent = '';
  }
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  if (video) video.srcObject = null;
}

async function countdown() {
  for (const number of [3, 2, 1]) {
    if (countdownEl) countdownEl.textContent = number;
    await wait(850);
  }
  if (countdownEl) countdownEl.textContent = '';
}

function drawImageCover(ctx, img, x, y, width, height, mirrored = false) {
  const sourceWidth = img.videoWidth || img.naturalWidth || img.width;
  const sourceHeight = img.videoHeight || img.naturalHeight || img.height;

  if (!sourceWidth || !sourceHeight) return;

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  ctx.save();
  if (mirrored) {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
  }
  ctx.restore();
}

function captureFrame() {
  captureCanvas.width = PHOTO_WIDTH;
  captureCanvas.height = PHOTO_HEIGHT;

  const ctx = captureCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

  if (video && video.readyState >= 2 && video.videoWidth) {
    drawImageCover(ctx, video, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT, true);
  }

  const data = captureCanvas.toDataURL('image/png');
  sessionStorage.setItem('picturePerfectCapturedImage', data);
  return data;
}

function resetDrawingCanvas() {
  const ctx = drawingCanvas.getContext('2d');
  ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  drawingCanvas.style.pointerEvents = 'auto';
  drawingStarted = false;
}

function initDrawing() {
  const capturedImage = sessionStorage.getItem('picturePerfectCapturedImage') || '';
  if (capturedImage && capturedPreview) capturedPreview.src = capturedImage;

  if (drawingStarted) return;

  resetDrawingCanvas();
  drawingStarted = true;
  secondsLeft = 30;
  updateTimer();

  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    secondsLeft -= 1;
    updateTimer();
    if (secondsLeft <= 0) {
      clearInterval(timerId);
      timerId = null;
      drawingCanvas.style.pointerEvents = 'none';
      mergeAndGo();
    }
  }, 1000);
}

function updateTimer() {
  timerEls.forEach((el) => {
    el.textContent = String(Math.max(0, secondsLeft));
  });
}

function getPointerPosition(event) {
  const rect = drawingCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (drawingCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (drawingCanvas.height / rect.height),
  };
}

function currentBrushSize() {
  return Number(document.querySelector('.brush-size')?.value || 9);
}

function applyStrokeStyle(ctx) {
  const size = currentBrushSize();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = activeColor;

  if (activeTool === 'pencil') {
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, size * 0.45);
  } else if (activeTool === 'pen') {
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, size * 0.7);
  } else {
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = Math.max(4, size * 1.35);
  }
}

function startStroke(event) {
  event.preventDefault();
  isDrawing = true;
  drawingCanvas.setPointerCapture?.(event.pointerId);

  const ctx = drawingCanvas.getContext('2d');
  applyStrokeStyle(ctx);
  const point = getPointerPosition(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function drawStroke(event) {
  if (!isDrawing) return;
  event.preventDefault();

  const ctx = drawingCanvas.getContext('2d');
  const point = getPointerPosition(event);
  applyStrokeStyle(ctx);

  if (activeTool === 'pencil') {
    ctx.lineTo(point.x + Math.random() * 2 - 1, point.y + Math.random() * 2 - 1);
    ctx.stroke();
  } else if (activeTool === 'paint') {
    ctx.lineTo(point.x + Math.random() * 4 - 2, point.y + Math.random() * 4 - 2);
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(7, currentBrushSize() * 1.85);
    ctx.strokeStyle = activeColor;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
}

function endStroke(event) {
  if (!isDrawing) return;
  isDrawing = false;
  drawingCanvas.releasePointerCapture?.(event.pointerId);
  drawingCanvas.getContext('2d').globalAlpha = 1;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function mergeImage() {
  const capturedImage = sessionStorage.getItem('picturePerfectCapturedImage') || '';
  const merged = document.createElement('canvas');
  merged.width = PHOTO_WIDTH;
  merged.height = PHOTO_HEIGHT;

  const ctx = merged.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

  if (capturedImage) {
    const image = await loadImage(capturedImage);
    drawImageCover(ctx, image, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT, false);
  }

  ctx.drawImage(drawingCanvas, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
  const finalImage = merged.toDataURL('image/png');
  sessionStorage.setItem('picturePerfectFinalImage', finalImage);
  return finalImage;
}

async function mergeAndGo() {
  await mergeImage();
  go('about');
}

function loadFinalImage() {
  const data = sessionStorage.getItem('picturePerfectFinalImage') || sessionStorage.getItem('picturePerfectCapturedImage') || '';
  finalPhotoEls.forEach((image) => {
    if (data) image.src = data;
  });
}

function finalImageData() {
  return sessionStorage.getItem('picturePerfectFinalImage') || sessionStorage.getItem('picturePerfectCapturedImage') || '';
}

async function ensureFinalImage() {
  const existing = sessionStorage.getItem('picturePerfectFinalImage');
  if (existing) return existing;
  if (drawingCanvas) return mergeImage();
  return sessionStorage.getItem('picturePerfectCapturedImage') || '';
}

function downloadImage(dataUrl = finalImageData()) {
  if (!dataUrl) return false;
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = dataUrl;
  link.download = `picture-perfect-${stamp}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

async function uploadFinalImage(dataUrl) {
  if (!dataUrl) throw new Error('No final image found to upload.');

  let response;
  try {
    response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData: dataUrl,
        filename: `picture-perfect-${Date.now()}.png`,
      }),
    });
  } catch (error) {
    throw new Error('Could not reach the upload API. Make sure /api/upload is deployed on Vercel.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Google Drive upload failed.');
  }

  return payload;
}

function setUploadStatus(message) {
  if (uploadStatus) uploadStatus.textContent = message || '';
}

async function handleYesChoice() {
  if (yesFlowBusy) return;
  yesFlowBusy = true;

  try {
    const dataUrl = await ensureFinalImage();
    downloadImage(dataUrl);
    go('yes-result');
    setUploadStatus('Uploading your image to the zine folder...');

    try {
      await uploadFinalImage(dataUrl);
      setUploadStatus('Uploaded successfully.');
    } catch (error) {
      console.warn('Google Drive upload failed:', error);
      setUploadStatus('Download saved. Upload was unavailable.');
    }
  } finally {
    yesFlowBusy = false;
  }
}

async function handleNoChoice() {
  await ensureFinalImage();
  go('no-result');
}

function resetExperience() {
  sessionStorage.removeItem('picturePerfectCapturedImage');
  sessionStorage.removeItem('picturePerfectFinalImage');
  if (timerId) clearInterval(timerId);
  timerId = null;
  secondsLeft = 30;
  drawingStarted = false;
  if (drawingCanvas) resetDrawingCanvas();
  if (capturedPreview) capturedPreview.removeAttribute('src');
  finalPhotoEls.forEach((image) => image.removeAttribute('src'));
  setUploadStatus('');
  go('home');
}

function installHoverState(selector, screenName) {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener('mouseenter', () => {
      if (matchMedia('(hover: hover)').matches && document.body.dataset.currentScreen === 'consent') {
        setScreen(screenName);
      }
    });
  });
}

document.querySelector('.camera-button')?.addEventListener('click', () => go('camera'));

document.querySelector('.capture-button')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;

  button.disabled = true;
  await countdown();
  captureFrame();
  flashEl?.classList.add('is-active');
  await wait(460);
  flashEl?.classList.remove('is-active');
  go('drawing');
  button.disabled = false;
});

drawingCanvas?.addEventListener('pointerdown', startStroke);
drawingCanvas?.addEventListener('pointermove', drawStroke);
drawingCanvas?.addEventListener('pointerup', endStroke);
drawingCanvas?.addEventListener('pointercancel', endStroke);
drawingCanvas?.addEventListener('pointerleave', endStroke);

document.querySelectorAll('.tool-button').forEach((button) => {
  button.addEventListener('click', () => {
    activeTool = button.dataset.tool;
    document.querySelectorAll('.tool-button').forEach((tool) => {
      tool.classList.toggle('is-active', tool === button);
    });
  });
});

document.querySelectorAll('.swatch').forEach((button) => {
  button.addEventListener('click', () => {
    activeColor = button.dataset.color;
    document.querySelectorAll('.swatch').forEach((swatch) => {
      swatch.classList.toggle('is-active', swatch === button);
    });
  });
});

document.querySelector('.continue-button')?.addEventListener('click', () => go('consent'));
document.querySelectorAll('.yes-choice').forEach((button) => button.addEventListener('click', handleYesChoice));
document.querySelectorAll('.no-choice').forEach((button) => button.addEventListener('click', handleNoChoice));
document.querySelectorAll('.download-button').forEach((button) => button.addEventListener('click', () => downloadImage()));
document.querySelectorAll('.create-button').forEach((button) => button.addEventListener('click', resetExperience));

// Hover is handled with CSS on the live consent screen so it cannot get stuck.
// installHoverState('.consent-screen[data-screen="consent"] .yes-choice', 'consent-yes');
// installHoverState('.consent-screen[data-screen="consent"] .no-choice', 'consent-no');

document.querySelectorAll('[data-screen="consent-yes"], [data-screen="consent-no"]').forEach((screen) => {
  screen.addEventListener('mouseleave', () => {
    if (matchMedia('(hover: hover)').matches && document.body.dataset.currentScreen.startsWith('consent')) {
      setScreen('consent');
    }
  });
});

window.addEventListener('hashchange', () => setScreen(screenFromHash()));
setScreen(screenFromHash());
