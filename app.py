import os
import re
import json
import sqlite3
import shutil
import mimetypes
import subprocess
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, unquote

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_FOLDER = os.path.join(BASE_DIR, 'media')
DB_FILE = os.path.join(BASE_DIR, 'tags.db')

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.webm', '.mp4'}

os.makedirs(MEDIA_FOLDER, exist_ok=True)

def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS image_tags (
                filename TEXT PRIMARY KEY,
                tags TEXT
            )
        ''')
        conn.commit()

def cleanup_orphaned_tags():
    """Removes DB entries for media that was deleted from the hard drive."""
    try:
        valid_files = set(f for f in os.listdir(MEDIA_FOLDER) if f.lower().endswith(tuple(ALLOWED_EXTENSIONS)))
        with sqlite3.connect(DB_FILE) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT filename FROM image_tags')
            db_files = set(row[0] for row in cursor.fetchall())
            
            orphans = db_files - valid_files
            for orphan in orphans:
                cursor.execute('DELETE FROM image_tags WHERE filename = ?', (orphan,))
            conn.commit()
            if orphans:
                print(f"Cleaned up {len(orphans)} orphaned items from database.")
    except Exception as e:
        print(f"Cleanup error: {e}")

def read_macos_tags(filepath):
    """Reads the macOS Finder Comment natively without external libraries."""
    try:
        # mdls is a native macOS command that reads file metadata
        result = subprocess.run(['mdls', '-raw', '-name', 'kMDItemFinderComment', filepath], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip() != '(null)':
            # Clean up the output (mdls wraps strings with spaces in quotes)
            return result.stdout.strip('"\n ')
    except Exception:
        pass
    return ""

def sync_new_files_from_macos():
    """Vacuum function: Finds new files in /media and ingests their macOS tags into SQLite."""
    try:
        valid_files = set(f for f in os.listdir(MEDIA_FOLDER) if f.lower().endswith(tuple(ALLOWED_EXTENSIONS)))
        with sqlite3.connect(DB_FILE) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT filename FROM image_tags')
            db_files = set(row[0] for row in cursor.fetchall())
            
            # Find files that are in the folder, but not in our database yet
            untracked_files = valid_files - db_files
            synced_count = 0
            
            for f in untracked_files:
                filepath = os.path.join(MEDIA_FOLDER, f)
                macos_tags = read_macos_tags(filepath)
                if macos_tags:
                    # Insert the tags found on the file system into our web database
                    cursor.execute('INSERT INTO image_tags (filename, tags) VALUES (?, ?)', (f, macos_tags))
                    synced_count += 1
                else:
                    # Insert a blank record so we don't scan it again next time
                    cursor.execute('INSERT INTO image_tags (filename, tags) VALUES (?, ?)', (f, ""))
            
            conn.commit()
            if synced_count > 0:
                print(f"Ingested existing tags from {synced_count} files via macOS metadata.")
    except Exception as e:
        print(f"macOS Sync error: {e}")

# Initialize Database and perform bidirectional sync
init_db()
cleanup_orphaned_tags()
sync_new_files_from_macos()

class GalleryHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/':
            self.path = '/templates/index.html'
            try:
                return super().do_GET()
            except (ConnectionAbortedError, BrokenPipeError):
                pass

        elif parsed_path.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        elif parsed_path.path == '/api/gallery':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            gallery_data = []
            try:
                files_with_time = []
                for f in os.listdir(MEDIA_FOLDER):
                    ext = os.path.splitext(f)[1].lower()
                    if ext in ALLOWED_EXTENSIONS:
                        filepath = os.path.join(MEDIA_FOLDER, f)
                        mtime = os.path.getmtime(filepath)
                        files_with_time.append((f, mtime))
                
                files_with_time.sort(key=lambda x: x[1], reverse=True)
                
                with sqlite3.connect(DB_FILE) as conn:
                    cursor = conn.cursor()
                    for f, _ in files_with_time:
                        cursor.execute('SELECT tags FROM image_tags WHERE filename = ?', (f,))
                        row = cursor.fetchone()
                        tags = row[0].split(',') if row and row[0] else []
                        gallery_data.append({
                            'filename': f,
                            'url': f'/media/{f}',
                            'tags': [t.strip() for t in tags if t.strip()]
                        })
            except Exception as e:
                print(f"Error reading media/db: {e}")

            self.wfile.write(json.dumps(gallery_data).encode('utf-8'))
            return

        elif parsed_path.path.startswith('/media/'):
            filename = unquote(parsed_path.path[len('/media/'):])
            filepath = os.path.join(MEDIA_FOLDER, filename)
            
            if not os.path.exists(filepath):
                self.send_error(404, "File not found")
                return
                
            content_type, _ = mimetypes.guess_type(filepath)
            if not content_type:
                content_type = 'application/octet-stream'

            try:
                file_size = os.path.getsize(filepath)
                f = open(filepath, 'rb')
                
                range_header = self.headers.get('Range', None)
                if range_header:
                    range_match = re.match(r'bytes=(\d+)-(\d*)', range_header)
                    if range_match:
                        start = int(range_match.group(1))
                        end_str = range_match.group(2)
                        end = int(end_str) if end_str else file_size - 1
                        
                        length = end - start + 1
                        
                        self.send_response(206)
                        self.send_header('Content-Type', content_type)
                        self.send_header('Accept-Ranges', 'bytes')
                        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                        self.send_header('Content-Length', str(length))
                        self.end_headers()
                        
                        f.seek(start)
                        bytes_to_send = length
                        while bytes_to_send > 0:
                            chunk = f.read(min(8192, bytes_to_send))
                            if not chunk: break
                            try:
                                self.wfile.write(chunk)
                            except (ConnectionAbortedError, BrokenPipeError):
                                break 
                            bytes_to_send -= len(chunk)
                        f.close()
                        return
                
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(file_size))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                try:
                    shutil.copyfileobj(f, self.wfile)
                except (ConnectionAbortedError, BrokenPipeError):
                    pass
                f.close()
                return
                
            except Exception as e:
                self.send_error(500, f"Internal Error: {e}")
                if 'f' in locals() and not f.closed:
                    f.close()
            return

        else:
            try:
                return super().do_GET()
            except (ConnectionAbortedError, BrokenPipeError):
                pass

    def do_POST(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/api/tags':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error(400, "Empty request")
                return

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            filename = data.get('filename')
            tags = ','.join(data.get('tags', []))

            # 1. Update SQLite (Fast read for the web UI)
            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO image_tags (filename, tags) 
                    VALUES (?, ?)
                    ON CONFLICT(filename) DO UPDATE SET tags=excluded.tags
                ''', (filename, tags))
                conn.commit()

            # 2. Update macOS File System (Data Portability)
            filepath = os.path.join(MEDIA_FOLDER, filename)
            if os.path.exists(filepath):
                # Escape quotes to prevent AppleScript injection errors
                safe_filepath = filepath.replace('"', '\\"')
                safe_tags = tags.replace('"', '\\"')
                
                applescript = f'''
                tell application "Finder"
                    set theFile to POSIX file "{safe_filepath}" as alias
                    set comment of theFile to "{safe_tags}"
                end tell
                '''
                # Run the command silently in the background
                subprocess.Popen(['osascript', '-e', applescript], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            return

        self.send_error(404, "Not Found")

def run(port=5000):
    if not mimetypes.inited:
        mimetypes.init()
    
    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    mimetypes.add_type('image/jpeg', '.jpg')
    mimetypes.add_type('image/jpeg', '.jpeg')
    mimetypes.add_type('image/png', '.png')
    mimetypes.add_type('image/gif', '.gif')
    mimetypes.add_type('image/webp', '.webp')
    mimetypes.add_type('video/webm', '.webm')
    mimetypes.add_type('video/mp4', '.mp4')

    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, GalleryHandler)
    
    print(f"Server starting cleanly on http://127.0.0.1:{port}")
    print(f"Drop your images/videos into: {MEDIA_FOLDER}")
    print("Press Ctrl+C to stop.")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == '__main__':
    run()
