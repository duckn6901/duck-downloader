import os
import sys
import glob
import time
import re
import json
import shutil
import urllib.request
import urllib.parse
from flask import Flask, render_template, request, jsonify, send_file, Response, stream_with_context
from flask_cors import CORS
import yt_dlp

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'static'),
    template_folder=os.path.join(BASE_DIR, 'templates')
)
CORS(app)

DOWNLOAD_DIR = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Helper: Check ffmpeg availability
def get_ffmpeg_path():
    system_ffmpeg = shutil.which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg
    local_ffmpeg = os.path.join(BASE_DIR, 'ffmpeg.exe')
    if os.path.exists(local_ffmpeg):
        return local_ffmpeg
    return None

# Helper: Clean up old downloads (> 1 hour old)
def cleanup_old_downloads():
    now = time.time()
    for filename in os.listdir(DOWNLOAD_DIR):
        file_path = os.path.join(DOWNLOAD_DIR, filename)
        if os.path.isfile(file_path):
            if now - os.path.getmtime(file_path) > 3600:
                try:
                    os.remove(file_path)
                except Exception:
                    pass

def get_yt_dlp_options():
    opts = {
        'quiet': True,
        'no_warnings': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web']
            }
        }
    }
    ffmpeg_p = get_ffmpeg_path()
    if ffmpeg_p:
        opts['ffmpeg_location'] = ffmpeg_p
    return opts

# Smart TikTok Extractor (TikWM API)
def fetch_tiktok_info(tiktok_url):
    try:
        api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(tiktok_url)}"
        req = urllib.request.Request(api_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        resp = urllib.request.urlopen(req, timeout=10)
        res = json.loads(resp.read().decode('utf-8'))
        if res.get('code') == 0:
            d = res.get('data', {})
            duration_sec = d.get('duration', 0)
            mins, secs = divmod(int(duration_sec), 60)
            hrs, mins = divmod(mins, 60)
            duration_str = f"{hrs:02d}:{mins:02d}:{secs:02d}" if hrs else f"{mins:02d}:{secs:02d}"
            
            return {
                'success': True,
                'title': d.get('title') or 'TikTok Video',
                'uploader': d.get('author', {}).get('nickname') or d.get('author', {}).get('unique_id') or 'TikTok Creator',
                'thumbnail': d.get('cover'),
                'duration': duration_str,
                'platform': 'TikTok',
                'video_url': d.get('play') or d.get('wmplay'),
                'audio_url': d.get('music'),
                'qualities': [
                    {'id': '720p', 'label': 'Video TikTok (Không Logo / Watermark)', 'type': 'video'},
                    {'id': 'mp3', 'label': 'Audio TikTok MP3 (Nhạc gốc)', 'type': 'audio'}
                ]
            }
    except Exception as e:
        print("TikTok API Error:", str(e))
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/info', methods=['POST'])
def get_video_info():
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'Vui lòng nhập liên kết video!'}), 400

    # 1. If TikTok URL, try TikWM API first
    if 'tiktok.com' in url.lower() or 'vt.tiktok' in url.lower() or 'vm.tiktok' in url.lower():
        tiktok_res = fetch_tiktok_info(url)
        if tiktok_res:
            return jsonify(tiktok_res)

    # 2. Use yt-dlp for YouTube, Facebook, Instagram, or TikTok fallback
    ydl_opts = get_yt_dlp_options()
    ydl_opts['extract_flat'] = False

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            extractor = info.get('extractor_key', '').lower()
            if 'tiktok' in extractor:
                platform = 'TikTok'
            elif 'youtube' in extractor:
                platform = 'YouTube'
            elif 'facebook' in extractor:
                platform = 'Facebook'
            elif 'instagram' in extractor:
                platform = 'Instagram'
            else:
                platform = info.get('extractor', 'Video')

            duration = info.get('duration')
            if duration:
                mins, secs = divmod(int(duration), 60)
                hrs, mins = divmod(mins, 60)
                duration_str = f"{hrs:02d}:{mins:02d}:{secs:02d}" if hrs else f"{mins:02d}:{secs:02d}"
            else:
                duration_str = "N/A"

            qualities = [
                {'id': '720p', 'label': 'Video 720p / HD', 'type': 'video'},
                {'id': '1080p', 'label': 'Video 1080p / Full HD', 'type': 'video'},
                {'id': '360p', 'label': 'Video 360p / SD', 'type': 'video'},
                {'id': 'mp3', 'label': 'Audio / Âm thanh MP3', 'type': 'audio'}
            ]

            thumbnail = info.get('thumbnail') or (info.get('thumbnails', [{}])[-1].get('url') if info.get('thumbnails') else '')

            return jsonify({
                'success': True,
                'title': info.get('title', 'Video Download'),
                'thumbnail': thumbnail,
                'duration': duration_str,
                'uploader': info.get('uploader') or info.get('uploader_id') or 'Tác giả',
                'platform': platform,
                'qualities': qualities
            })

    except Exception as e:
        if 'tiktok.com' in url.lower() or 'vt.tiktok' in url.lower():
            tiktok_res = fetch_tiktok_info(url)
            if tiktok_res:
                return jsonify(tiktok_res)

        error_msg = str(e)
        if 'Unsupported URL' in error_msg:
            return jsonify({'error': 'Liên kết không được hỗ trợ. Vui lòng kiểm tra lại URL.'}), 400
        elif 'Sign in to confirm' in error_msg:
            try:
                fallback_opts = get_yt_dlp_options()
                fallback_opts['extractor_args'] = {'youtube': {'player_client': ['android']}}
                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    return jsonify({
                        'success': True,
                        'title': info.get('title', 'Video Download'),
                        'thumbnail': info.get('thumbnail', ''),
                        'duration': 'N/A',
                        'uploader': info.get('uploader', 'YouTube'),
                        'platform': 'YouTube',
                        'qualities': [
                            {'id': '720p', 'label': 'Video 720p / HD', 'type': 'video'},
                            {'id': 'mp3', 'label': 'Audio / Âm thanh MP3', 'type': 'audio'}
                        ]
                    })
            except Exception:
                pass
        return jsonify({'error': f'Lỗi lấy thông tin video: {error_msg}'}), 500

@app.route('/api/download', methods=['GET'])
def download_video():
    url = request.args.get('url', '').strip()
    quality = request.args.get('quality', '720p').strip()

    if not url:
        return jsonify({'error': 'Thiếu liên kết URL'}), 400

    cleanup_old_downloads()
    timestamp = int(time.time() * 1000)

    # 1. TikTok Instant Stream (Zero Disk Lag)
    if 'tiktok.com' in url.lower() or 'vt.tiktok' in url.lower() or 'vm.tiktok' in url.lower():
        tiktok_res = fetch_tiktok_info(url)
        if tiktok_res:
            target_media_url = tiktok_res['audio_url'] if quality == 'mp3' else tiktok_res['video_url']
            ext = 'mp3' if quality == 'mp3' else 'mp4'
            clean_title = re.sub(r'[^\w\s-]', '', tiktok_res['title']).strip() or 'TikTok_Video'
            clean_title = clean_title.replace(' ', '_')[:35]
            download_filename = f"DuckDownloader_{clean_title}.{ext}"

            def generate_stream():
                req = urllib.request.Request(target_media_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                })
                with urllib.request.urlopen(req, timeout=30) as res:
                    while True:
                        chunk = res.read(64 * 1024)
                        if not chunk:
                            break
                        yield chunk

            return Response(
                stream_with_context(generate_stream()),
                mimetype='application/octet-stream',
                headers={
                    'Content-Disposition': f'attachment; filename="{download_filename}"',
                    'Content-Type': 'application/octet-stream'
                }
            )

    # 2. Standard yt-dlp download pipeline for YouTube / Facebook
    out_tmpl = os.path.join(DOWNLOAD_DIR, f'media_{timestamp}_%(id)s.%(ext)s')

    ydl_opts = get_yt_dlp_options()
    ydl_opts['outtmpl'] = out_tmpl
    ydl_opts['windowsfilenames'] = True

    has_ffmpeg = get_ffmpeg_path() is not None

    if has_ffmpeg:
        if quality == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        elif quality == '360p':
            ydl_opts['format'] = 'bestvideo[height<=360]+bestaudio/b[height<=360]/sd/best'
        elif quality == '720p':
            ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/b[height<=720]/hd/sd/best'
        elif quality == '1080p':
            ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/b[height<=1080]/hd/sd/best'
        else:
            ydl_opts['format'] = 'best'
    else:
        if quality == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
        elif quality == '360p':
            ydl_opts['format'] = 'b[height<=360]/sd/best[height<=360]/best'
        elif quality == '720p':
            ydl_opts['format'] = 'hd/b[height<=720]/sd/best[height<=720]/best'
        elif quality == '1080p':
            ydl_opts['format'] = 'hd/b[height<=1080]/sd/best[height<=1080]/best'
        else:
            ydl_opts['format'] = 'hd/sd/best'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

            if quality == 'mp3' and has_ffmpeg:
                base, _ = os.path.splitext(filename)
                if os.path.exists(base + '.mp3'):
                    filename = base + '.mp3'

            if not os.path.exists(filename):
                matching_files = glob.glob(os.path.join(DOWNLOAD_DIR, f'media_{timestamp}_*'))
                if matching_files:
                    filename = matching_files[0]
                else:
                    return jsonify({'error': 'Không tìm thấy file sau khi tải về.'}), 500

            download_name = os.path.basename(filename)
            clean_download_name = re.sub(r'^media_\d+_', '', download_name)

            resp = send_file(
                filename,
                as_attachment=True,
                download_name=clean_download_name,
                mimetype='application/octet-stream'
            )
            resp.headers["Content-Type"] = "application/octet-stream"
            resp.headers["Content-Disposition"] = f'attachment; filename="{clean_download_name}"'
            return resp

    except Exception as e:
        return jsonify({'error': f'Lỗi tải xuống: {str(e)}'}), 500

if __name__ == '__main__':
    print("=== DUCKDOWNLOADER WEB SERVER STARTED ===")
    print("Truy cập ứng dụng tại: http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
