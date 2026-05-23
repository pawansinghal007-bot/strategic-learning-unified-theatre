#!/usr/bin/env python3
"""
Browser Capture v2 — Native Host
- Argon2id password hashing
- Normalized SQLite schema (sessions, page_events, chat_sessions, chat_messages)
- Stream deduplication for AI chat
- Ollama enrichment
"""

import sys, json, struct, sqlite3, threading, logging, os, queue, socket, secrets
from pathlib import Path
from datetime import datetime, timezone

def utcnow() -> str:
    """Return current UTC time as ISO string — compatible with Python 3.14+."""
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', '')

# ── pip install argon2-cffi ──
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError
    PH = PasswordHasher()
    ARGON2_AVAILABLE = True
except ImportError:
    ARGON2_AVAILABLE = False

# ── Config ──
BASE_DIR = Path(os.environ.get('APPDATA', Path.home())) / 'BrowserCapture'
BASE_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH   = BASE_DIR / 'capture.db'
LOG_PATH  = BASE_DIR / 'host.log'
SCHEMA_PATH = Path(__file__).parent / 'schema.sql'

OLLAMA_URL    = 'http://localhost:11434/api/generate'
OLLAMA_MODEL  = 'llama3'
OLLAMA_ON     = True
OLLAMA_TYPES  = {'chat_message'}

logging.basicConfig(filename=str(LOG_PATH), level=logging.INFO,
                    format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('bc')

# ── In-memory session token store (username -> token) ──
active_tokens: dict[str, str] = {}

# ── DB ──
def get_db():
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = get_db()
    schema = SCHEMA_PATH.read_text(encoding='utf-8')
    con.executescript(schema)
    con.commit()
    con.close()
    log.info(f'DB ready: {DB_PATH}')

# ── Auth ──
def create_user(username: str, password: str) -> dict:
    if not ARGON2_AVAILABLE:
        return {'error': 'argon2-cffi not installed. Run: pip install argon2-cffi'}
    if len(password) < 8:
        return {'error': 'Password must be at least 8 characters'}
    pw_hash = PH.hash(password)
    try:
        con = get_db()
        con.execute('INSERT INTO app_users(username, password_hash) VALUES (?,?)',
                    (username, pw_hash))
        con.commit()
        con.close()
        log.info(f'User created: {username}')
        return {'status': 'ok', 'message': f'User {username} created'}
    except sqlite3.IntegrityError:
        return {'error': f'Username {username!r} already exists'}

def login_user(username: str, password: str, source: str = 'extension') -> dict:
    con = get_db()
    row = con.execute(
        'SELECT id, password_hash FROM app_users WHERE username=?', (username,)
    ).fetchone()

    success = False
    user_id = None
    if row:
        try:
            if ARGON2_AVAILABLE:
                PH.verify(row['password_hash'], password)
            else:
                # Fallback plain compare (dev only)
                success = (row['password_hash'] == password)
            success = True
            user_id = row['id']
        except Exception:
            success = False

    con.execute('INSERT INTO login_audit(username, success, source) VALUES (?,?,?)',
                (username, 1 if success else 0, source))
    if success:
        con.execute('UPDATE app_users SET last_login_at=? WHERE id=?',
                    (utcnow(), user_id))
    con.commit()
    con.close()

    if success:
        token = secrets.token_hex(32)
        active_tokens[username] = token
        log.info(f'Login OK: {username}')
        return {'status': 'ok', 'token': token, 'user_id': user_id}
    log.warning(f'Login FAIL: {username}')
    return {'error': 'Invalid credentials'}

def verify_token(username: str, token: str) -> bool:
    return active_tokens.get(username) == token

# ── Event writers ──
def upsert_browser_session(event: dict) -> str:
    sid = event.get('sessionId', 'unknown')
    browser = event.get('browser', 'unknown')
    con = get_db()
    existing = con.execute('SELECT id FROM browser_sessions WHERE id=?', (sid,)).fetchone()
    if not existing:
        con.execute(
            'INSERT INTO browser_sessions(id, browser, started_at, machine_name) VALUES (?,?,?,?)',
            (sid, browser, event.get('ts', utcnow()), socket.gethostname())
        )
        con.commit()
    con.close()
    return sid

def write_page_event(event: dict):
    sid = upsert_browser_session(event)
    payload = event.get('payload', {})
    con = get_db()
    cur = con.execute('''
        INSERT INTO page_events(session_id, ts, site, url, title, event_type, selector, text_value, metadata_json)
        VALUES (?,?,?,?,?,?,?,?,?)
    ''', (
        sid,
        event.get('ts'),
        event.get('site'),
        event.get('url'),
        event.get('title'),
        event.get('type'),
        payload.get('selector'),
        payload.get('value') or payload.get('text'),
        json.dumps(payload) if payload else None
    ))
    row_id = cur.lastrowid
    # FTS
    con.execute('INSERT INTO page_events_fts(rowid, text_value, url, title) VALUES (?,?,?,?)',
                (row_id,
                 payload.get('value') or payload.get('text') or '',
                 event.get('url',''),
                 event.get('title','')))
    con.commit()
    con.close()

# ── Chat session cache (chatSessionId -> db id) ──
chat_session_cache: dict[str, str] = {}

def upsert_chat_session(event: dict) -> str:
    """Ensure a chat_sessions row exists; return its id."""
    payload  = event.get('payload', {})
    chat_key = payload.get('conversationId') or event.get('sessionId', 'unknown')
    if chat_key in chat_session_cache:
        return chat_key

    browser_sid = upsert_browser_session(event)
    now = utcnow()
    con = get_db()
    existing = con.execute('SELECT id FROM chat_sessions WHERE id=?', (chat_key,)).fetchone()
    if not existing:
        con.execute('''
            INSERT INTO chat_sessions(id, session_id, site, url, conversation_key, model_name, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?)
        ''', (chat_key, browser_sid, event.get('site'), event.get('url'),
              payload.get('conversationId'), payload.get('model'), now, now))
    else:
        con.execute('UPDATE chat_sessions SET updated_at=?, url=? WHERE id=?',
                    (now, event.get('url'), chat_key))
    con.commit()
    con.close()
    chat_session_cache[chat_key] = chat_key
    return chat_key

# ── Stream deduplication ──
# Tracks last text seen per (chat_session_id, role) to avoid duplicating streamed chunks
stream_state: dict[str, str] = {}

def write_chat_message(event: dict):
    payload   = event.get('payload', {})
    role      = payload.get('role', 'assistant')
    text      = payload.get('text', '')
    is_final  = payload.get('final', True)
    msg_key   = payload.get('messageId')

    if not text.strip():
        return

    chat_sid = upsert_chat_session(event)
    dedup_key = f'{chat_sid}:{role}:{msg_key}'

    # Skip if identical to last streamed chunk
    if not is_final and stream_state.get(dedup_key) == text:
        return
    stream_state[dedup_key] = text

    # For streaming: upsert the row (update text until final)
    con = get_db()
    if not is_final and msg_key:
        existing = con.execute(
            'SELECT id FROM chat_messages WHERE chat_session_id=? AND message_key=?',
            (chat_sid, msg_key)
        ).fetchone()
        if existing:
            con.execute('UPDATE chat_messages SET text_content=?, stream_state=? WHERE id=?',
                        (text, 'streaming', existing['id']))
            con.commit()
            con.close()
            return

    cur = con.execute('''
        INSERT INTO chat_messages(chat_session_id, message_key, role, text_content,
                                  html_content, stream_state, ts, metadata_json)
        VALUES (?,?,?,?,?,?,?,?)
    ''', (
        chat_sid, msg_key, role, text,
        payload.get('html'), 'final' if is_final else 'streaming',
        event.get('ts', utcnow()),
        json.dumps({'model': payload.get('model'), 'site': event.get('site')})
    ))
    row_id = cur.lastrowid
    con.execute('INSERT INTO chat_messages_fts(rowid, text_content) VALUES (?,?)', (row_id, text))
    con.commit()
    con.close()

    if OLLAMA_ON and is_final and event.get('type') in OLLAMA_TYPES:
        enrich_q.put((event, row_id))

# ── Ollama enrichment ──
enrich_q: queue.Queue = queue.Queue()

def enrich_worker():
    import urllib.request
    while True:
        try:
            event, row_id = enrich_q.get(timeout=5)
            text = event.get('payload', {}).get('text', '')[:1500]
            if len(text) < 20:
                continue
            prompt = (
                f'Summarise this AI chat message in one sentence (max 80 chars) and give 3 topic tags.\n'
                f'Text: {text}\n'
                f'Respond ONLY as JSON: {{"summary":"...","tags":"tag1,tag2,tag3"}}'
            )
            payload = json.dumps({'model': OLLAMA_MODEL, 'prompt': prompt,
                                  'stream': False, 'options': {'temperature': 0.2}}).encode()
            req = urllib.request.Request(OLLAMA_URL, data=payload,
                                         headers={'Content-Type':'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=10) as r:
                res   = json.loads(r.read())
                raw   = res.get('response','{}').strip().strip('`')
                if raw.startswith('json'): raw = raw[4:]
                parsed = json.loads(raw)
                con = get_db()
                con.execute(
                    "UPDATE chat_messages SET metadata_json=json_patch(metadata_json, ?) WHERE id=?",
                    (json.dumps({'llm_summary': parsed.get('summary'),
                                 'llm_tags':    parsed.get('tags')}), row_id)
                )
                con.commit()
                con.close()
        except queue.Empty:
            pass
        except Exception as e:
            log.warning(f'Enrich error: {e}')

# ── Dispatch table ──
def handle(event: dict) -> dict:
    t = event.get('type', '')

    if t == 'create_user':
        return create_user(event.get('username',''), event.get('password',''))

    if t == 'login':
        return login_user(event.get('username',''), event.get('password',''),
                          event.get('browser','extension'))

    if t in ('page_view', 'click', 'input_change', 'text_selected'):
        write_page_event(event)
        return {'status': 'ok'}

    if t in ('prompt_submit', 'assistant_chunk', 'assistant_message_final', 'chat_message'):
        write_chat_message(event)
        return {'status': 'ok'}

    if t == 'conversation_context':
        # Store full context snapshot as a page_event metadata blob
        write_page_event(event)
        return {'status': 'ok'}

    log.debug(f'Unhandled event type: {t}')
    return {'status': 'ignored', 'type': t}

# ── Native messaging I/O ──
def read_msg():
    raw = sys.stdin.buffer.read(4)
    if not raw or len(raw) < 4: return None
    length = struct.unpack('<I', raw)[0]
    if length == 0: return None
    return json.loads(sys.stdin.buffer.read(length).decode('utf-8'))

def send_msg(data: dict):
    msg = json.dumps(data).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(msg)))
    sys.stdout.buffer.write(msg)
    sys.stdout.buffer.flush()

# ── Main ──
def main():
    log.info('Browser Capture v2 native host started')
    if not ARGON2_AVAILABLE:
        log.warning('argon2-cffi not found — run: pip install argon2-cffi')
    init_db()
    threading.Thread(target=enrich_worker, daemon=True).start()

    while True:
        try:
            event = read_msg()
            if event is None:
                log.info('EOF — shutting down')
                break
            log.info(f"← {event.get('type')} | {event.get('site','')} | {event.get('url','')[:60]}")
            result = handle(event)
            send_msg(result)
        except json.JSONDecodeError as e:
            log.error(f'JSON error: {e}')
        except Exception as e:
            log.exception(f'Unhandled: {e}')
            try: send_msg({'error': str(e)})
            except: pass

if __name__ == '__main__':
    main()
