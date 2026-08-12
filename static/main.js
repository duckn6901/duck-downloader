let currentVideoUrl = '';

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

// Start download
function startDownload() {
    if (!currentVideoUrl) return;

    const qualitySelect = document.getElementById('qualitySelect');
    const selectedQuality = qualitySelect.value;
    const downloadProgress = document.getElementById('downloadProgress');

    downloadProgress.classList.remove('hidden');

    // Build API endpoint URL
    const downloadApiUrl = `/api/download?url=${encodeURIComponent(currentVideoUrl)}&quality=${encodeURIComponent(selectedQuality)}`;

    // Create a hidden anchor element to trigger file download
    const hiddenAnchor = document.createElement('a');
    hiddenAnchor.href = downloadApiUrl;
    hiddenAnchor.target = '_blank';
    document.body.appendChild(hiddenAnchor);
    hiddenAnchor.click();
    document.body.removeChild(hiddenAnchor);

    // Hide progress indicator after delay
    setTimeout(() => {
        downloadProgress.classList.add('hidden');
    }, 6000);
}

function showError(msg) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
    errorMessage.classList.remove('hidden');
}
