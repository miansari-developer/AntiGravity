// State
let originalFile = null;
let originalObjectURL = null;
let compressedBlob = null;
let compressedObjectURL = null;
let compressionTimeout = null;
let imageAspectRatio = 1;
let isRatioLocked = true;
let originalDims = { width: 0, height: 0 };
let currentUnit = 'px';

// DOM Elements
const elements = {
  uploadZone: document.getElementById('upload-zone'),
  fileInput: document.getElementById('file-input'),
  workspace: document.getElementById('workspace'),

  qualitySlider: document.getElementById('quality-slider'),
  qualityVal: document.getElementById('quality-val'),
  qualityWarning: document.getElementById('quality-warning'),
  maxWidth: document.getElementById('max-width'),
  maxHeight: document.getElementById('max-height'),
  dimensionUnit: document.getElementById('dimension-unit'),
  lockRatioBtn: document.getElementById('lock-ratio-btn'),
  lockIcon: document.getElementById('lock-icon'),
  unlockIcon: document.getElementById('unlock-icon'),
  formatSelect: document.getElementById('format-select'),

  originalPreview: document.getElementById('original-preview'),
  originalSize: document.getElementById('original-size'),
  originalDim: document.getElementById('original-dim'),

  compressedPreview: document.getElementById('compressed-preview'),
  compressedSize: document.getElementById('compressed-size'),
  compressedDim: document.getElementById('compressed-dim'),
  loadingOverlay: document.getElementById('loading-overlay'),

  resetBtn: document.getElementById('reset-btn'),
  downloadBtn: document.getElementById('download-btn')
};

// Utilities
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDimensionString(pxWidth, pxHeight, unit, origW, origH) {
  if (!origW || !origH) return '--';
  if (unit === 'px') return `${Math.round(pxWidth)}x${Math.round(pxHeight)}`;
  if (unit === '%') {
    const pctW = +((pxWidth / origW) * 100).toFixed(1);
    const pctH = +((pxHeight / origH) * 100).toFixed(1);
    return `${pctW}% x ${pctH}%`;
  }
  if (unit === 'in') {
    const inW = +(pxWidth / 96).toFixed(2);
    const inH = +(pxHeight / 96).toFixed(2);
    return `${inW}in x ${inH}in`;
  }
  if (unit === 'cm') {
    const cmW = +(pxWidth / (96 / 2.54)).toFixed(2);
    const cmH = +(pxHeight / (96 / 2.54)).toFixed(2);
    return `${cmW}cm x ${cmH}cm`;
  }
  return '--';
}

// Event Listeners
function init() {
  // Drag and Drop
  elements.uploadZone.addEventListener('click', () => elements.fileInput.click());

  elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.add('dragover');
  });

  elements.uploadZone.addEventListener('dragleave', () => {
    elements.uploadZone.classList.remove('dragover');
  });

  elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFileSelect(e.target.files[0]);
    }
  });

  // Controls Settings
  elements.qualitySlider.addEventListener('input', (e) => {
    elements.qualityVal.textContent = e.target.value;
    scheduleCompression();
  });

  elements.lockRatioBtn.addEventListener('click', () => {
    isRatioLocked = !isRatioLocked;
    if (isRatioLocked) {
      elements.lockRatioBtn.classList.add('active');
      elements.lockIcon.style.display = 'block';
      elements.unlockIcon.style.display = 'none';
      if (elements.maxWidth.value) syncDimensions('width');
      else if (elements.maxHeight.value) syncDimensions('height');
    } else {
      elements.lockRatioBtn.classList.remove('active');
      elements.lockIcon.style.display = 'none';
      elements.unlockIcon.style.display = 'block';
    }
    scheduleCompression();
  });

  elements.formatSelect.addEventListener('change', scheduleCompression);

  elements.dimensionUnit.addEventListener('change', (e) => {
    const newUnit = e.target.value;
    if (newUnit === currentUnit) return;
    
    const convertValue = (val, fromUnit, toUnit, maxDim) => {
      if (!val || isNaN(val)) return '';
      let pxOrig = val;
      if (fromUnit === '%') pxOrig = maxDim * (val / 100);
      else if (fromUnit === 'in') pxOrig = val * 96;
      else if (fromUnit === 'cm') pxOrig = val * (96 / 2.54);
      
      if (toUnit === 'px') return Math.round(pxOrig);
      if (toUnit === '%') return +(pxOrig / maxDim * 100).toFixed(2);
      if (toUnit === 'in') return +(pxOrig / 96).toFixed(2);
      if (toUnit === 'cm') return +(pxOrig / (96 / 2.54)).toFixed(2);
      return val;
    };
    
    if (elements.maxWidth.value) {
      elements.maxWidth.value = convertValue(parseFloat(elements.maxWidth.value), currentUnit, newUnit, originalDims.width);
    }
    if (elements.maxHeight.value) {
      elements.maxHeight.value = convertValue(parseFloat(elements.maxHeight.value), currentUnit, newUnit, originalDims.height);
    }

    currentUnit = newUnit;
    updatePlaceholders();
    
    if (originalDims.width) {
      elements.originalDim.textContent = formatDimensionString(originalDims.width, originalDims.height, currentUnit, originalDims.width, originalDims.height);
    }
    
    scheduleCompression();
  });
  
  elements.maxWidth.addEventListener('input', () => {
    if (isRatioLocked) syncDimensions('width');
    scheduleCompression();
  });
  
  elements.maxHeight.addEventListener('input', () => {
    if (isRatioLocked) syncDimensions('height');
    scheduleCompression();
  });

  const preventArrows = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    }
  };
  elements.maxWidth.addEventListener('keydown', preventArrows);
  elements.maxHeight.addEventListener('keydown', preventArrows);

  elements.resetBtn.addEventListener('click', resetApp);
  elements.downloadBtn.addEventListener('click', downloadCompressedImage);
}

// Logic
function updatePlaceholders() {
  if (!originalDims.width) return;
  const getPlaceholder = (pxDim) => {
     if (currentUnit === 'px') return Math.round(pxDim);
     if (currentUnit === '%') return 100;
     if (currentUnit === 'in') return +(pxDim / 96).toFixed(2);
     if (currentUnit === 'cm') return +(pxDim / (96 / 2.54)).toFixed(2);
  };
  
  elements.maxWidth.placeholder = getPlaceholder(originalDims.width);
  elements.maxHeight.placeholder = getPlaceholder(originalDims.height);
}

function handleFileSelect(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file.');
    return;
  }

  originalFile = file;

  if (originalObjectURL) URL.revokeObjectURL(originalObjectURL);
  originalObjectURL = URL.createObjectURL(file);

  elements.originalPreview.src = originalObjectURL;
  elements.originalSize.textContent = formatBytes(file.size);

  const img = new Image();
  img.onload = () => {
    imageAspectRatio = img.width / img.height;
    originalDims = { width: img.width, height: img.height };
    
    currentUnit = elements.dimensionUnit.value;
    updatePlaceholders();
    
    elements.originalDim.textContent = formatDimensionString(img.width, img.height, currentUnit, originalDims.width, originalDims.height);

    // Transition to workspace
    elements.uploadZone.style.display = 'none';
    elements.workspace.classList.remove('hidden');
    compressImage();
  };
  img.src = originalObjectURL;
}

function syncDimensions(source) {
  if (!imageAspectRatio) return;
  if (source === 'width') {
     const w = parseFloat(elements.maxWidth.value);
     if (!isNaN(w)) elements.maxHeight.value = +(w / imageAspectRatio).toFixed(2);
     else elements.maxHeight.value = '';
  } else {
     const h = parseFloat(elements.maxHeight.value);
     if (!isNaN(h)) elements.maxWidth.value = +(h * imageAspectRatio).toFixed(2);
     else elements.maxWidth.value = '';
  }
}

function scheduleCompression() {
  if (!originalFile) return;
  // Debounce rapid slider movement
  clearTimeout(compressionTimeout);
  elements.loadingOverlay.classList.remove('hidden');
  compressionTimeout = setTimeout(compressImage, 300);
}

async function compressImage() {
  if (!originalFile) return;

  elements.loadingOverlay.classList.remove('hidden');

  const quality = parseInt(elements.qualitySlider.value) / 100;
  const targetFormat = elements.formatSelect.value;
  let maxWInput = parseFloat(elements.maxWidth.value);
  let maxHInput = parseFloat(elements.maxHeight.value);
  let dimUnit = elements.dimensionUnit.value;

  // Create an image object to get dimensions
  const img = new Image();
  img.src = originalObjectURL;

  await new Promise(resolve => {
    img.onload = resolve;
  });

  let width = img.width;
  let height = img.height;

  const convertToPx = (val, unit, originalDim) => {
    if (isNaN(val)) return NaN;
    if (unit === 'px') return val;
    if (unit === '%') return originalDim * (val / 100);
    if (unit === 'in') return val * 96; // Standard web DPI
    if (unit === 'cm') return val * (96 / 2.54);
    return val;
  };

  let maxWPx = convertToPx(maxWInput, dimUnit, img.width);
  let maxHPx = convertToPx(maxHInput, dimUnit, img.height);

  let maxW = isNaN(maxWPx) ? 0 : maxWPx;
  let maxH = isNaN(maxHPx) ? 0 : maxHPx;

  if (!isRatioLocked) {
    if (maxW) width = maxW;
    if (maxH) height = maxH;
  } else {
    // Both properties managed safely due to prior syncing
    if (maxW) width = maxW;
    if (maxH) height = maxH;
  }

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  elements.compressedDim.textContent = formatDimensionString(width, height, currentUnit, originalDims.width, originalDims.height);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  // Export to blob
  canvas.toBlob(
    (blob) => {
      // Small optimization wait
      setTimeout(() => {
        compressedBlob = blob;

        if (compressedObjectURL) URL.revokeObjectURL(compressedObjectURL);
        compressedObjectURL = URL.createObjectURL(blob);

        elements.compressedPreview.src = compressedObjectURL;

        updateStats();
        elements.loadingOverlay.classList.add('hidden');
      }, 100);
    },
    targetFormat,
    quality
  );
}

function updateStats() {
  if (!originalFile || !compressedBlob) return;

  const origSize = originalFile.size;
  const newSize = compressedBlob.size;

  elements.compressedSize.textContent = formatBytes(newSize);

  const reduction = ((origSize - newSize) / origSize) * 100;

  if (reduction > 0) {
    elements.compressedSize.setAttribute('data-reduction', `-${reduction.toFixed(1)}%`);
    elements.compressedSize.style.color = 'var(--text-main)';
  } else {
    elements.compressedSize.setAttribute('data-reduction', `+${Math.abs(reduction).toFixed(1)}%`);
    elements.compressedSize.style.color = '#ff5555';
  }
}

function downloadCompressedImage() {
  if (!compressedBlob) return;

  // Construct new file name
  const originalName = originalFile.name;
  const extIndex = originalName.lastIndexOf('.');
  const nameBase = extIndex !== -1 ? originalName.substring(0, extIndex) : originalName;

  // Map format to extension
  const formatExtMap = {
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/png': '.png'
  };
  const targetFormat = elements.formatSelect.value;
  const ext = formatExtMap[targetFormat] || '.jpg';

  const newFileName = `${nameBase}_compressed${ext}`;

  const a = document.createElement('action');
  const link = document.createElement('a');
  link.href = compressedObjectURL;
  link.download = newFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function resetApp() {
  originalFile = null;
  compressedBlob = null;

  if (originalObjectURL) URL.revokeObjectURL(originalObjectURL);
  if (compressedObjectURL) URL.revokeObjectURL(compressedObjectURL);

  elements.uploadZone.style.display = 'block';
  elements.workspace.classList.add('hidden');

  elements.originalPreview.src = '';
  elements.compressedPreview.src = '';
  elements.originalDim.textContent = '--';
  elements.compressedDim.textContent = '--';
  elements.originalSize.textContent = '--';
  elements.compressedSize.textContent = '--';

  originalDims = { width: 0, height: 0 };
  elements.maxWidth.placeholder = 'Auto';
  elements.maxHeight.placeholder = 'Auto';
  elements.maxWidth.value = '';
  elements.maxHeight.value = '';

  elements.fileInput.value = '';
}

// Bootstrap
document.addEventListener('DOMContentLoaded', init);
