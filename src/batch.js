import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

// State
// ... (rest of state and DOM elements)
let fileQueue = [];
let isProcessing = false;
let processedCount = 0;

// DOM Elements
const elements = {
  uploadZone: document.getElementById('upload-zone'),
  fileInput: document.getElementById('file-input'),
  workspace: document.getElementById('workspace'),
  queueBody: document.getElementById('queue-body'),
  emptyState: document.getElementById('empty-state'),
  queueCount: document.getElementById('queue-count'),
  
  qualitySlider: document.getElementById('quality-slider'),
  qualityVal: document.getElementById('quality-val'),
  targetSize: document.getElementById('target-size'),
  maxWidth: document.getElementById('max-width'),
  maxHeight: document.getElementById('max-height'),
  dimensionUnit: document.getElementById('dimension-unit'),
  formatSelect: document.getElementById('format-select'),
  
  processBtn: document.getElementById('process-btn'),
  resetBtn: document.getElementById('reset-btn'),
  downloadAllBtn: document.getElementById('download-all-btn'),
  
  lockBtn: document.getElementById('lock-aspect-ratio'),
  lockIconUnlocked: document.getElementById('lock-icon-unlocked'),
  lockIconLocked: document.getElementById('lock-icon-locked'),
  
  themeToggle: document.getElementById('theme-toggle'),
  themeIconLight: document.getElementById('theme-icon-light'),
  themeIconDark: document.getElementById('theme-icon-dark')
};

// State Extension
let isAspectRatioLocked = false;
let inputAspectRatio = 1;

// Utilities
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Logic
function init() {
  initTheme();

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
      handleFiles(e.dataTransfer.files);
    }
  });

  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFiles(e.target.files);
    }
  });

  elements.qualitySlider.addEventListener('input', (e) => {
    elements.qualityVal.textContent = e.target.value;
    invalidateResults();
  });

  // Watch for settings changes to invalidate results
  [elements.targetSize, elements.maxWidth, elements.maxHeight, elements.dimensionUnit, elements.formatSelect].forEach(el => {
    el.addEventListener('change', invalidateResults);
    if (el.type === 'number') {
      el.addEventListener('input', invalidateResults);
    }
  });

  // Aspect Ratio Lock Listeners
  elements.lockBtn.addEventListener('click', toggleLock);
  
  elements.maxWidth.addEventListener('input', () => {
    if (isAspectRatioLocked && elements.maxWidth.value) {
      elements.maxHeight.value = Math.round(elements.maxWidth.value / inputAspectRatio);
    }
  });

  elements.maxHeight.addEventListener('input', () => {
    if (isAspectRatioLocked && elements.maxHeight.value) {
      elements.maxWidth.value = Math.round(elements.maxHeight.value * inputAspectRatio);
    }
  });

  elements.processBtn.addEventListener('click', processAll);
  elements.resetBtn.addEventListener('click', resetQueue);
  elements.downloadAllBtn.addEventListener('click', downloadAll);
  elements.themeToggle.addEventListener('click', toggleTheme);
}

function invalidateResults() {
  if (isProcessing) return;
  
  let needsReset = false;
  fileQueue.forEach(entry => {
    if (entry.status !== 'pending') {
      entry.status = 'pending';
      entry.compressedBlob = null;
      entry.error = null;
      needsReset = true;
      
      const row = document.getElementById(`row-${entry.id}`);
      if (row) {
        row.querySelector('.compressed-size').textContent = '--';
        const badge = row.querySelector('.status-badge');
        badge.className = 'status-badge status-pending';
        badge.textContent = 'Pending';
      }
    }
  });
  
  if (needsReset) {
    elements.downloadAllBtn.classList.add('hidden');
  }
}

function toggleLock() {
  isAspectRatioLocked = !isAspectRatioLocked;
  elements.lockBtn.classList.toggle('locked', isAspectRatioLocked);
  elements.lockIconUnlocked.classList.toggle('hidden', isAspectRatioLocked);
  elements.lockIconLocked.classList.toggle('hidden', !isAspectRatioLocked);

  if (isAspectRatioLocked) {
    const w = parseFloat(elements.maxWidth.value);
    const h = parseFloat(elements.maxHeight.value);
    if (w && h) {
      inputAspectRatio = w / h;
    } else {
      // Default to 1 if one is missing
      inputAspectRatio = 1;
      if (w) elements.maxHeight.value = w;
      else if (h) elements.maxWidth.value = h;
    }
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'dark';
  applyTheme(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);

  if (theme === 'dark') {
    elements.themeIconDark.style.display = 'block';
    elements.themeIconLight.style.display = 'none';
  } else {
    elements.themeIconDark.style.display = 'none';
    elements.themeIconLight.style.display = 'block';
  }
}

function handleFiles(files) {
  const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  
  if (newFiles.length === 0) return;

  newFiles.forEach(file => {
    const fileEntry = {
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      originalSize: file.size,
      compressedBlob: null,
      thumbnailUrl: URL.createObjectURL(file),
      status: 'pending',
      error: null
    };
    fileQueue.push(fileEntry);
    addQueueRow(fileEntry);
  });

  elements.uploadZone.classList.add('hidden');
  elements.workspace.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  updateQueueUI();
}

function addQueueRow(entry) {
  const tr = document.createElement('tr');
  tr.id = `row-${entry.id}`;
  tr.innerHTML = `
    <td>
      <div class="file-info">
        <img src="${entry.thumbnailUrl}" class="queue-thumb" alt="thumbnail">
        <div class="file-details">
          <span class="file-name" title="${entry.file.name}">${entry.file.name}</span>
        </div>
      </div>
    </td>
    <td>${formatBytes(entry.originalSize)}</td>
    <td class="compressed-size">--</td>
    <td>
      <span class="status-badge status-pending">Pending</span>
    </td>
  `;
  elements.queueBody.appendChild(tr);
}

function updateQueueUI() {
  elements.queueCount.textContent = fileQueue.length;
}

async function processAll() {
  if (isProcessing || fileQueue.length === 0) return;
  
  isProcessing = true;
  elements.processBtn.disabled = true;
  elements.processBtn.textContent = 'Processing...';
  elements.downloadAllBtn.classList.add('hidden');
  
  processedCount = 0;
  
  const settings = {
    quality: parseInt(elements.qualitySlider.value) / 100,
    targetSize: parseFloat(elements.targetSize.value) * 1024 || null, // Convert KB to Bytes
    maxWidth: parseFloat(elements.maxWidth.value) || null,
    maxHeight: parseFloat(elements.maxHeight.value) || null,
    unit: elements.dimensionUnit.value,
    format: elements.formatSelect.value
  };

  for (const entry of fileQueue) {
    if (entry.status === 'success') continue;
    
    updateRowStatus(entry.id, 'processing', 'Processing...');
    
    try {
      const resultBlob = await compressImage(entry.file, settings);
      entry.compressedBlob = resultBlob;
      entry.status = 'success';
      updateRowStatus(entry.id, 'success', 'Done', resultBlob.size, entry.originalSize);
    } catch (err) {
      console.error(err);
      entry.status = 'error';
      entry.error = err.message;
      updateRowStatus(entry.id, 'error', 'Error');
    }
    
    processedCount++;
  }
  
  isProcessing = false;
  elements.processBtn.disabled = false;
  elements.processBtn.textContent = 'Compress All';
  
  const allDone = fileQueue.every(e => e.status === 'success' || e.status === 'error');
  const hasResults = fileQueue.some(e => e.status === 'success');
  
  if (allDone && hasResults) {
    elements.downloadAllBtn.classList.remove('hidden');
  }
}

function updateRowStatus(id, status, text, newSize = null, oldSize = null) {
  const row = document.getElementById(`row-${id}`);
  if (!row) return;
  
  const badge = row.querySelector('.status-badge');
  badge.className = `status-badge status-${status}`;
  badge.textContent = text;
  
  if (newSize !== null) {
    const sizeTd = row.querySelector('.compressed-size');
    const reduction = ((oldSize - newSize) / oldSize) * 100;
    sizeTd.innerHTML = `${formatBytes(newSize)} <span class="size-reduction">-${reduction.toFixed(1)}%</span>`;
  }
}

async function compressImage(file, settings) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  
  let width = img.width;
  let height = img.height;
  const ratio = width / height;
  
  // Calculate Target Dimensions
  const DPI = 96;
  let targetW = settings.maxWidth;
  let targetH = settings.maxHeight;

  if (settings.unit === 'inch') {
    if (targetW) targetW *= DPI;
    if (targetH) targetH *= DPI;
  } else if (settings.unit === 'cm') {
    if (targetW) targetW *= (DPI / 2.54);
    if (targetH) targetH *= (DPI / 2.54);
  } else if (settings.unit === 'mm') {
    if (targetW) targetW *= (DPI / 25.4);
    if (targetH) targetH *= (DPI / 25.4);
  }

  if (settings.unit === 'px' || settings.unit === 'inch' || settings.unit === 'cm' || settings.unit === 'mm') {
    if (targetW && width > targetW) {
      width = targetW;
      height = width / ratio;
    }
    if (targetH && height > targetH) {
      height = targetH;
      width = height * ratio;
    }
  } else if (settings.unit === '%') {
    if (targetW) {
      width = (img.width * targetW) / 100;
      height = width / ratio;
    }
    if (targetH) {
      height = (img.height * targetH) / 100;
      width = height * ratio;
    }
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  
  URL.revokeObjectURL(url);
  
  // Compression Strategy
  if (settings.format === 'application/pdf') {
    // For PDF, we first obtain the compressed image result as a JPEG blob
    let imageBlob;
    if (settings.targetSize) {
      imageBlob = await iterativeCompress(canvas, 'image/jpeg', settings.targetSize, settings.quality);
    } else {
      imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', settings.quality));
    }

    // Convert blob to DataURL for embedding in PDF
    const imgData = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(imageBlob);
    });

    const pdf = new jsPDF({
      orientation: width > height ? 'l' : 'p',
      unit: 'px',
      format: [width, height]
    });
    pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
    return pdf.output('blob');
  } else if (settings.targetSize && (settings.format === 'image/jpeg' || settings.format === 'image/webp')) {
    return await iterativeCompress(canvas, settings.format, settings.targetSize, settings.quality);
  } else {
    return await new Promise(resolve => {
      canvas.toBlob(resolve, settings.format, settings.quality);
    });
  }
}

async function iterativeCompress(canvas, format, targetSizeBytes, initialQuality) {
  let minQuality = 0.1;
  let maxQuality = 1.0;
  let currentQuality = initialQuality;
  let bestBlob = null;
  
  // Maximum 6 iterations for binary search performance
  for (let i = 0; i < 6; i++) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, currentQuality));
    
    if (!bestBlob || Math.abs(blob.size - targetSizeBytes) < Math.abs(bestBlob.size - targetSizeBytes)) {
      bestBlob = blob;
    }
    
    if (Math.abs(blob.size - targetSizeBytes) < targetSizeBytes * 0.05) {
      // Within 5% tolerance
      break;
    }
    
    if (blob.size > targetSizeBytes) {
      maxQuality = currentQuality;
    } else {
      minQuality = currentQuality;
    }
    
    currentQuality = (minQuality + maxQuality) / 2;
  }
  
  return bestBlob;
}

async function downloadAll() {
  const zip = new JSZip();
  const folder = zip.folder("photon_compressed_images");
  
  const formatExtMap = {
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/png': '.png',
    'application/pdf': '.pdf'
  };
  
  fileQueue.forEach(entry => {
    if (entry.status === 'success' && entry.compressedBlob) {
      const ext = formatExtMap[elements.formatSelect.value] || '.jpg';
      const name = entry.file.name.substring(0, entry.file.name.lastIndexOf('.')) || entry.file.name;
      folder.file(`${name}_compressed${ext}`, entry.compressedBlob);
    }
  });
  
  const content = await zip.generateAsync({type:"blob"});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `photon_batch_${Date.now()}.zip`;
  link.click();
}

function resetQueue() {
  fileQueue.forEach(entry => {
    if (entry.thumbnailUrl) {
      URL.revokeObjectURL(entry.thumbnailUrl);
    }
  });
  fileQueue = [];
  elements.queueBody.innerHTML = '';
  elements.uploadZone.classList.remove('hidden');
  elements.workspace.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  elements.downloadAllBtn.classList.add('hidden');
  elements.fileInput.value = '';
  updateQueueUI();
}

document.addEventListener('DOMContentLoaded', init);
