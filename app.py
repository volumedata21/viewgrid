import os
import sys
import re
import json
import sqlite3
import shutil
import mimetypes
import subprocess
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_FOLDER = os.path.join(BASE_DIR, 'media')

# --- NEW: Create a dedicated data folder for the database ---
DATA_FOLDER = os.path.join(BASE_DIR, 'data')
DB_FILE = os.path.join(DATA_FOLDER, 'tags.db')
IS_READONLY = False

# Note: .json is deliberately NOT here so sidecars aren't treated as images
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.webm', '.mp4', '.mov'}

os.makedirs(MEDIA_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)

def get_all_media_files():
    valid_files = set()
    for root, dirs, files in os.walk(MEDIA_FOLDER, followlinks=True):
        
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['@eaDir', '#recycle']]
        
        for f in files:
            # Ignore Mac 'AppleDouble' ghost files
            if f.startswith('.'):
                continue
                
            if f.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
                abs_path = os.path.join(root, f)
                rel_path = os.path.relpath(abs_path, MEDIA_FOLDER)
                valid_files.add(rel_path)
    return valid_files

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
    try:
        valid_files = get_all_media_files()
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

def read_sidecar_tags(filepath):
    sidecar_path = filepath + '.json'
    if os.path.exists(sidecar_path):
        try:
            with open(sidecar_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return ",".join(data.get("tags", []))
        except Exception as e:
            print(f"Error reading sidecar {sidecar_path}: {e}")
    return None 

def read_macos_tags(filepath):
    try:
        result = subprocess.run(['mdls', '-raw', '-name', 'kMDItemFinderComment', filepath], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip() != '(null)':
            return result.stdout.strip('"\n ')
    except Exception:
        pass
    return ""

def sync_files_metadata():
    try:
        valid_files = get_all_media_files()
        with sqlite3.connect(DB_FILE) as conn:
            cursor = conn.cursor()
            migrated_count = 0
            
            for rel_path in valid_files:
                filepath = os.path.join(MEDIA_FOLDER, rel_path)
                sidecar_path = filepath + '.json'
                tags_to_save = ""
                
                if os.path.exists(sidecar_path):
                    sidecar_tags = read_sidecar_tags(filepath)
                    if sidecar_tags is not None:
                        tags_to_save = sidecar_tags
                else:
                    macos_tags = read_macos_tags(filepath)
                    if macos_tags:
                        tags_to_save = macos_tags
                    else:
                        cursor.execute('SELECT tags FROM image_tags WHERE filename = ?', (rel_path,))
                        row = cursor.fetchone()
                        if row and row[0]:
                            tags_to_save = row[0]
                    
                    if tags_to_save:
                        tag_list = [t.strip() for t in tags_to_save.split(',') if t.strip()]
                        try:
                            with open(sidecar_path, 'w', encoding='utf-8') as f:
                                json.dump({"tags": tag_list}, f, indent=4)
                            migrated_count += 1
                        except Exception as e:
                            print(f"Error migrating sidecar for {rel_path}: {e}")
                
                cursor.execute('''
                    INSERT INTO image_tags (filename, tags) 
                    VALUES (?, ?)
                    ON CONFLICT(filename) DO UPDATE SET tags=excluded.tags
                ''', (rel_path, tags_to_save))
            
            conn.commit()
            if migrated_count > 0:
                print(f"✅ Master Audit complete: Migrated {migrated_count} files to Universal JSON sidecars.")
            else:
                print("✅ Metadata is fully synced.")
                
    except Exception as e:
        print(f"Metadata Sync error: {e}")

init_db()
cleanup_orphaned_tags()
sync_files_metadata()

class GalleryHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/' or (not '.' in parsed_path.path and not parsed_path.path.startswith(('/api/', '/media/', '/static/'))):
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
                valid_files = get_all_media_files()
                files_with_time = []
                
                for rel_path in valid_files:
                    filepath = os.path.join(MEDIA_FOLDER, rel_path)
                    mtime = os.path.getmtime(filepath)
                    files_with_time.append((rel_path, mtime))
                
                files_with_time.sort(key=lambda x: x[1], reverse=True)
                
                with sqlite3.connect(DB_FILE) as conn:
                    cursor = conn.cursor()
                    for rel_path, _ in files_with_time:
                        cursor.execute('SELECT tags FROM image_tags WHERE filename = ?', (rel_path,))
                        row = cursor.fetchone()
                        tags = row[0].split(',') if row and row[0] else []
                        
                        # --- NEW: Standardize everything to forward slashes ---
                        clean_rel_path = rel_path.replace('\\', '/')
                        board_name = os.path.dirname(clean_rel_path)
                        
                        if not board_name:
                            board_name = "Main" 
                            
                        gallery_data.append({
                            'filename': clean_rel_path,
                            'url': f'/media/{clean_rel_path}',
                            'board': board_name,
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
        global IS_READONLY
        if IS_READONLY:
            self.send_error(403, "Forbidden: Tallo is running in Read-Only mode.")
            return
            
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/api/upload':
            encoded_filename = self.headers.get('X-File-Name')
            if not encoded_filename:
                self.send_error(400, "Missing filename")
                return
                
            filename = unquote(encoded_filename)
            filename = os.path.basename(filename) 
            
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error(400, "Empty file")
                return

            file_data = self.rfile.read(content_length)

            filepath = os.path.join(MEDIA_FOLDER, filename)
            with open(filepath, 'wb') as f:
                f.write(file_data)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success', 'filename': filename}).encode('utf-8'))
            return
            
        if parsed_path.path == '/api/tags':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error(400, "Empty request")
                return

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            filename = data.get('filename')
            tags = ','.join(data.get('tags', []))

            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO image_tags (filename, tags) 
                    VALUES (?, ?)
                    ON CONFLICT(filename) DO UPDATE SET tags=excluded.tags
                ''', (filename, tags))
                conn.commit()

            filepath = os.path.join(MEDIA_FOLDER, filename)
            if os.path.exists(filepath):
                sidecar_path = filepath + '.json'
                tag_list = [t.strip() for t in tags.split(',') if t.strip()]
                try:
                    with open(sidecar_path, 'w', encoding='utf-8') as f:
                        json.dump({"tags": tag_list}, f, indent=4)
                except Exception as e:
                    print(f"Error saving sidecar for {filename}: {e}")

                safe_filepath = filepath.replace('"', '\\"')
                safe_tags = tags.replace('"', '\\"')
                applescript = f'''
                tell application "Finder"
                    set theFile to POSIX file "{safe_filepath}" as alias
                    set comment of theFile to "{safe_tags}"
                end tell
                '''
                subprocess.Popen(['osascript', '-e', applescript], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            return

        self.send_error(404, "Not Found")

def run(host='127.0.0.1', port=7000, readonly=False):
    global IS_READONLY
    IS_READONLY = readonly

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

    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, GalleryHandler)
    
    print("\n" + "="*50)
    print(f"🚀 TALLO IS LIVE!")
    print(f"👉 Service is available on: http://localhost:{port}")
    print("="*50 + "\n")
    
    if readonly:
        print("🔒 READ-ONLY MODE ACTIVE: Uploads and tagging are disabled.")
    elif host == '0.0.0.0':
        print("⚠️  NETWORK SHARING ENABLED: Anyone on your Wi-Fi can access Tallo.")
        print(f"   (They can connect via your computer's IP address: http://<your-ip>:{port})")
        
    print(f"\n📂 Drop your images/videos into: {MEDIA_FOLDER}")
    print("🛑 Press Ctrl+C to stop the server.")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Tallo Gallery Server")
    parser.add_argument('-p', '--port', type=int, default=7000, help="Port to run the server on")
    parser.add_argument('--host', type=str, default='127.0.0.1', help="Host IP to bind to")
    parser.add_argument('--readonly', action='store_true', help="Disable uploads and tagging")
    
    args = parser.parse_args()
    run(host=args.host, port=args.port, readonly=args.readonly)
