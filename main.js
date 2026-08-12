let currentVideoUrl = '';

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
