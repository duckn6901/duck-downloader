let currentVideoUrl = '';
let pdfPageImages = []; // Stores generated PNG data URLs & filenames

// Configure PDF.js Worker
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Tab Switcher
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    // Highlight button
    const activeBtn = Array.from(document.querySelectorAll('.nav-tab')).find(b => b.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');
}

// Check in-app browser (Zalo / Facebook / Messenger / Instagram)
document.addEventListener('DOMContentLoaded', () => {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isInApp = /Zalo|FBAN|FBAV|Instagram|Messenger/i.test(ua);
    if (isInApp) {
        const notice = document.getElementById('inAppNotice');
        if (notice) notice.classList.remove('hidden');
    }
});

// Paste link from clipboard
async function handlePasteLink() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            document.getElementById('videoUrl').value = text;
        }
    } catch (err) {
        console.log('Clipboard paste not allowed or empty:', err);
    }
}

// Update the direct <a> href link dynamically
function updateDownloadLink() {
    if (!currentVideoUrl) return;

    const qualitySelect = document.getElementById('qualitySelect');
    const selectedQuality = qualitySelect ? qualitySelect.value : '720p';
    const btnDownload = document.getElementById('btnDownload');

    const downloadApiUrl = `/api/download?url=${encodeURIComponent(currentVideoUrl)}&quality=${encodeURIComponent(selectedQuality)}`;
    const ext = selectedQuality === 'mp3' ? 'mp3' : 'mp4';

    btnDownload.href = downloadApiUrl;
    btnDownload.setAttribute('download', `DuckDownloader_Video.${ext}`);

    const labelSpan = btnDownload.querySelector('span');
    if (labelSpan) {
        if (selectedQuality === 'mp3') {
            labelSpan.textContent = 'Tải MP3 (Âm Thanh)';
        } else if (selectedQuality === '1080p') {
            labelSpan.textContent = 'Tải MP4 (Full HD 1080p)';
        } else if (selectedQuality === '360p') {
            labelSpan.textContent = 'Tải MP4 (360p SD)';
        } else {
            labelSpan.textContent = 'Tải MP4 (Không Logo / HD)';
        }
    }
}

// Fetch video info
async function handleFetchInfo(event) {
    event.preventDefault();
    
    const urlInput = document.getElementById('videoUrl');
    const url = urlInput.value.trim();
    const errorMessage = document.getElementById('errorMessage');
    const loader = document.getElementById('loader');
    const resultCard = document.getElementById('resultCard');
    const btnSubmit = document.getElementById('btnSubmit');

    if (!url) {
        showError('Vui lòng dán liên kết video!');
        return;
    }

    // Reset UI state
    errorMessage.classList.add('hidden');
    resultCard.classList.add('hidden');
    loader.classList.remove('hidden');
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.7';

    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Không thể lấy thông tin video.');
        }

        currentVideoUrl = url;

        // Populate Video Card Data
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoUploader').textContent = data.uploader;
        document.getElementById('videoDuration').textContent = data.duration;
        document.getElementById('videoThumbnail').src = data.thumbnail || 'https://via.placeholder.com/640x360?text=No+Thumbnail';

        // Platform Badge
        const platformTag = document.getElementById('platformTag');
        platformTag.innerHTML = `<i class="fa-solid fa-play"></i> ${data.platform}`;

        // Populate Quality Select
        const qualitySelect = document.getElementById('qualitySelect');
        if (data.qualities && data.qualities.length > 0) {
            qualitySelect.innerHTML = '';
            data.qualities.forEach((q, idx) => {
                const opt = document.createElement('option');
                opt.value = q.id;
                opt.textContent = q.label;
                if (idx === 0) opt.selected = true;
                qualitySelect.appendChild(opt);
            });
        }

        // Update the direct download <a> href link
        updateDownloadLink();

        // Show result card
        loader.classList.add('hidden');
        resultCard.classList.remove('hidden');

    } catch (err) {
        loader.classList.add('hidden');
        showError(err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
    }
}

// Handle Download Click Animation
function handleDownloadClick(event) {
    const downloadProgress = document.getElementById('downloadProgress');
    if (downloadProgress) {
        downloadProgress.classList.remove('hidden');
        setTimeout(() => {
            downloadProgress.classList.add('hidden');
        }, 6000);
    }
}

function showError(msg) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
    errorMessage.classList.remove('hidden');
}

/* ================= PDF TO PNG CONVERTER LOGIC ================= */

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('pdfDropzone');
    if (dz) dz.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('pdfDropzone');
    if (dz) dz.classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('pdfDropzone');
    if (dz) dz.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        processPdfFile(files[0]);
    }
}

function handlePdfSelected(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
        processPdfFile(files[0]);
    }
}

// Core PDF to High-Res PNG conversion engine
async function processPdfFile(file) {
    if (!file || file.type !== 'application/pdf') {
        alert('Vui lòng chọn 1 tệp định dạng PDF!');
        return;
    }

    const pdfDropzone = document.getElementById('pdfDropzone');
    const pdfLoader = document.getElementById('pdfLoader');
    const pdfResults = document.getElementById('pdfResults');
    const pdfPagesGrid = document.getElementById('pdfPagesGrid');
    const pdfStatusText = document.getElementById('pdfStatusText');

    pdfDropzone.classList.add('hidden');
    pdfResults.classList.add('hidden');
    pdfLoader.classList.remove('hidden');
    pdfPagesGrid.innerHTML = '';
    pdfPageImages = [];

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        document.getElementById('pdfFileName').textContent = file.name;
        document.getElementById('pdfPageCount').textContent = `Tổng số: ${pdf.numPages} trang ảnh PNG (Sắc nét 300 DPI)`;

        const scale = 2.5; // High resolution render scale for crisp text & images

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            pdfStatusText.textContent = `Đang chuyển đổi trang ${pageNum} / ${pdf.numPages}...`;

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const pngDataUrl = canvas.toDataURL('image/png');
            const cleanBaseName = file.name.replace(/\.pdf$/i, '');
            const pngFileName = `${cleanBaseName}_trang_${pageNum}.png`;

            pdfPageImages.push({
                pageNum: pageNum,
                fileName: pngFileName,
                dataUrl: pngDataUrl
            });

            // Build Page Card UI
            const pageCard = document.createElement('div');
            pageCard.className = 'page-card';
            pageCard.innerHTML = `
                <span class="page-badge">Trang ${pageNum}</span>
                <div class="page-preview-wrapper">
                    <img src="${pngDataUrl}" alt="Trang ${pageNum}">
                </div>
                <a href="${pngDataUrl}" download="${pngFileName}" class="btn-page-download">
                    <i class="fa-solid fa-download"></i> <span>Tải Trang ${pageNum} (PNG)</span>
                </a>
            `;
            pdfPagesGrid.appendChild(pageCard);
        }

        pdfLoader.classList.add('hidden');
        pdfResults.classList.remove('hidden');

    } catch (err) {
        pdfLoader.classList.add('hidden');
        pdfDropzone.classList.remove('hidden');
        alert('Lỗi đọc file PDF: ' + err.message);
    }
}

// Download all rendered pages as a ZIP file
async function downloadAllPagesAsZip() {
    if (!pdfPageImages || pdfPageImages.length === 0) return;

    const btnZip = document.getElementById('btnDownloadZip');
    const originalText = btnZip.innerHTML;
    btnZip.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang nén ZIP...</span>`;
    btnZip.disabled = true;

    try {
        const zip = new JSZip();
        const folderName = document.getElementById('pdfFileName').textContent.replace(/\.pdf$/i, '');

        pdfPageImages.forEach(img => {
            // Strip data URL header
            const base64Data = img.dataUrl.replace(/^data:image\/png;base64,/, "");
            zip.file(img.fileName, base64Data, { base64: true });
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `DuckDownloader_${folderName}_PNG_Images.zip`);

    } catch (err) {
        alert('Lỗi tạo file ZIP: ' + err.message);
    } finally {
        btnZip.innerHTML = originalText;
        btnZip.disabled = false;
    }
}
