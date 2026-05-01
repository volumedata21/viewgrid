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

DATA_FOLDER = os.path.join(BASE_DIR, 'data')
DB_FILE = os.path.join(DATA_FOLDER, 'tags.db')
IS_READONLY = False

# Note: .json is deliberately NOT here so sidecars aren't treated as images
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.webm', '.mp4', '.mov'}

os.makedirs(MEDIA_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)

# --- NEW: Helper function to read the ignore file ---
def get_ignored_folders():
    ignored = {'@eaDir', '#recycle'}
    ignore_file_path = os.path.join(BASE_DIR, '.talloignore')
    if os.path.exists(ignore_file_path):
        try:
            with open(ignore_file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    clean_line = line.strip().replace('\\', '/')
                    if clean_line and not clean_line.startswith('#'):
                        ignored.add(clean_line)
        except Exception:
            pass
    return ignored

# --- UPDATED: Scanner now skips ignored folders completely ---
def get_all_media_files():
    valid_files = set()
    ignored_paths = get_ignored_folders()
    
    for root, dirs, files in os.walk(MEDIA_FOLDER, followlinks=True):
        current_rel_root = os.path.relpath(root, MEDIA_FOLDER)
        if current_rel_root == '.':
            current_rel_root = ''
        current_rel_root = current_rel_root.replace('\\', '/')
        
        # Prune ignored directories so os.walk skips them entirely
        valid_dirs = []
        for d in dirs:
            if d.startswith('.') or d in ['@eaDir', '#recycle']: 
                continue
            dir_rel_path = f"{current_rel_root}/{d}" if current_rel_root else d
            if dir_rel_path in ignored_paths:
                continue
            valid_dirs.append(d)
            
        dirs[:] = valid_dirs
        
        for f in files:
            if f.startswith('.'): continue
            if f.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
                rel_path = f"{current_rel_root}/{f}" if current_rel_root else f
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
        
        cursor.execute("PRAGMA table_info(image_tags)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'description' not in columns:
            cursor.execute("ALTER TABLE image_tags ADD COLUMN description TEXT DEFAULT ''")
            
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

def read_sidecar_data(filepath):
    sidecar_path = filepath + '.json'
    if os.path.exists(sidecar_path):
        try:
            with open(sidecar_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                tags = ",".join(data.get("tags", []))
                description = data.get("description", "")
                return tags, description
        except Exception as e:
            print(f"Error reading sidecar {sidecar_path}: {e}")
    return None, ""

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
                desc_to_save = ""
                
                if os.path.exists(sidecar_path):
                    sidecar_tags, sidecar_desc = read_sidecar_data(filepath)
                    if sidecar_tags is not None:
                        tags_to_save = sidecar_tags
                        desc_to_save = sidecar_desc
                else:
                    macos_tags = read_macos_tags(filepath)
                    if macos_tags:
                        tags_to_save = macos_tags
                    else:
                        cursor.execute('SELECT tags, description FROM image_tags WHERE filename = ?', (rel_path,))
                        row = cursor.fetchone()
                        if row:
                            tags_to_save = row[0] if row[0] else ""
                            desc_to_save = row[1] if row[1] else ""
                    
                    if tags_to_save or desc_to_save:
                        tag_list = [t.strip() for t in tags_to_save.split(',') if t.strip()]
                        try:
                            with open(sidecar_path, 'w', encoding='utf-8') as f:
                                json.dump({"tags": tag_list, "description": desc_to_save}, f, indent=4)
                            migrated_count += 1
                        except Exception as e:
                            print(f"Error migrating sidecar for {rel_path}: {e}")
                
                cursor.execute('''
                    INSERT INTO image_tags (filename, tags, description) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(filename) DO UPDATE SET tags=excluded.tags, description=excluded.description
                ''', (rel_path, tags_to_save, desc_to_save))
            
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
            
            # --- Anti-cache headers are here! ---
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            
            self.end_headers()

            gallery_data = []
            try:
                valid_files = get_all_media_files()
                files_with_time = []
                
                for rel_path in valid_files:
                    filepath = os.path.join(MEDIA_FOLDER, rel_path)
                    
                    # --- UPDATED: Sort by "Date Added" instead of "Date Modified" ---
                    stat = os.stat(filepath)
                    try:
                        # Mac: The exact moment it was copied/born into the Tallo folder
                        sort_time = stat.st_birthtime
                    except AttributeError:
                        # Windows/Linux: The moment the file was added/changed
                        sort_time = stat.st_ctime
                        
                    files_with_time.append((rel_path, sort_time))
                
                files_with_time.sort(key=lambda x: x[1], reverse=True)
                
                with sqlite3.connect(DB_FILE) as conn:
                    cursor = conn.cursor()
                    
                    # --- The Dictionary Optimization is here! ---
                    cursor.execute('SELECT filename, tags, description FROM image_tags')
                    db_lookup = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}
                    
                    for rel_path, _ in files_with_time:
                        db_entry = db_lookup.get(rel_path)
                        
                        tags_str = db_entry[0] if db_entry and db_entry[0] else ""
                        description = db_entry[1] if db_entry and len(db_entry) > 1 and db_entry[1] else ""
                        
                        tags = tags_str.split(',') if tags_str else []
                        
                        clean_rel_path = rel_path.replace('\\', '/')
                        board_name = os.path.dirname(clean_rel_path)
                        
                        if not board_name:
                            board_name = "Main" 
                            
                        gallery_data.append({
                            'filename': clean_rel_path,
                            'url': f'/media/{clean_rel_path}',
                            'board': board_name,
                            'tags': [t.strip() for t in tags if t.strip()],
                            'description': description
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
            
        if parsed_path.path == '/api/metadata':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error(400, "Empty request")
                return

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            filename = data.get('filename')
            tags = ','.join(data.get('tags', []))
            description = data.get('description', "")

            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO image_tags (filename, tags, description) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(filename) DO UPDATE SET tags=excluded.tags, description=excluded.description
                ''', (filename, tags, description))
                conn.commit()

            filepath = os.path.join(MEDIA_FOLDER, filename)
            if os.path.exists(filepath):
                sidecar_path = filepath + '.json'
                tag_list = [t.strip() for t in tags.split(',') if t.strip()]
                try:
                    with open(sidecar_path, 'w', encoding='utf-8') as f:
                        json.dump({"tags": tag_list, "description": description}, f, indent=4)
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

        # --- NEW: The /api/ignore POST endpoint is here! ---
        if parsed_path.path == '/api/ignore':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error(400, "Empty request")
                return

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            board = data.get('board')

            if board and board != "Main":
                ignore_file_path = os.path.join(BASE_DIR, '.talloignore')
                try:
                    # Force-create it if it doesn't exist to avoid OS permission errors
                    if not os.path.exists(ignore_file_path):
                        with open(ignore_file_path, 'w', encoding='utf-8') as f:
                            f.write(f"{board}\n")
                    else:
                        with open(ignore_file_path, 'a', encoding='utf-8') as f:
                            f.write(f"\n{board}\n")
                    print(f"✅ Successfully hid directory: {board}")
                except Exception as e:
                    print(f"❌ Error writing to .talloignore: {e}")
                    self.send_error(500, "Failed to update ignore list")
                    return

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            return

        self.send_error(404, "Not Found")

    def do_DELETE(self):
        global IS_READONLY
        if IS_READONLY:
            self.send_error(403, "Forbidden: Tallo is running in Read-Only mode.")
            return
            
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/api/delete':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error(400, "Empty request")
                return

            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            filename = data.get('filename')

            if not filename:
                self.send_error(400, "Missing filename")
                return

            # 1. Remove from SQLite Database
            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM image_tags WHERE filename = ?', (filename,))
                conn.commit()

            # 2. Delete the physical image and sidecar
            filepath = os.path.join(MEDIA_FOLDER, filename)
            sidecar_path = filepath + '.json'

            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                if os.path.exists(sidecar_path):
                    os.remove(sidecar_path)
            except Exception as e:
                print(f"Error deleting files for {filename}: {e}")
                self.send_error(500, "Failed to delete files")
                return

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
