"""
Browser Capture DB API
Exposes SQLite data as REST endpoints for your app and Ollama RAG pipeline.

Install: pip install flask flask-cors
Run:     python api.py
Base URL: http://localhost:7070
"""

import sqlite3
import json
import os
import urllib.request
from pathlib import Path
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH     = Path(os.environ.get('APPDATA', Path.home())) / 'BrowserCapture' / 'capture.db'
OLLAMA_URL  = 'http://localhost:11434/api/generate'
OLLAMA_MODEL = 'llama3'

def get_db():
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con

# ── Helpers ──
def rows_to_list(rows):
    return [dict(r) for r in rows]

# ══════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    """Simple health check."""
    return jsonify({'status': 'ok', 'db': str(DB_PATH)})


@app.route('/events', methods=['GET'])
def get_events():
    """
    Query captured page events.
    Params:
      limit      int   (default 100)
      offset     int   (default 0)
      site       str   filter by site domain
      since      str   ISO datetime filter
      url        str   partial URL match
    """
    limit      = int(request.args.get('limit', 100))
    offset     = int(request.args.get('offset', 0))
    site       = request.args.get('site')
    since      = request.args.get('since')
    url        = request.args.get('url')

    query  = 'SELECT id, ts, site, url, text_value FROM page_events WHERE 1=1'
    params = []

    if site:
        query += ' AND site = ?'; params.append(site)
    if since:
        query += ' AND ts >= ?'; params.append(since)
    if url:
        query += ' AND url LIKE ?'; params.append(f'%{url}%')

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?'
    params += [limit, offset]

    con = get_db()
    rows = con.execute(query, params).fetchall()
    con.close()
    return jsonify(rows_to_list(rows))


@app.route('/events/search', methods=['GET'])
def search_events():
    """
    Full-text search across captured page events.
    Param: q (required)
    """
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': 'q parameter required'}), 400

    limit = int(request.args.get('limit', 50))
    con = get_db()
    rows = con.execute('''
        SELECT p.id, p.ts, p.site, p.url, p.text_value 
        FROM page_events p
        WHERE p.text_value LIKE ? OR p.url LIKE ? OR p.title LIKE ?
        ORDER BY p.id DESC
        LIMIT ?
    ''', (f'%{q}%', f'%{q}%', f'%{q}%', limit)).fetchall()
    con.close()
    return jsonify(rows_to_list(rows))


@app.route('/events/stats', methods=['GET'])
def get_stats():
    """Summary statistics for dashboard."""
    con = get_db()
    
    total_pages = con.execute('SELECT COUNT(*) FROM page_events').fetchone()[0]
    total_messages = con.execute('SELECT COUNT(*) FROM chat_messages').fetchone()[0]
    total_sessions = con.execute('SELECT COUNT(*) FROM browser_sessions').fetchone()[0]
    
    by_site = rows_to_list(con.execute(
        'SELECT site, COUNT(*) as count FROM page_events GROUP BY site ORDER BY count DESC LIMIT 20'
    ).fetchall())
    
    top_urls = rows_to_list(con.execute(
        'SELECT url, COUNT(*) as count FROM page_events GROUP BY url ORDER BY count DESC LIMIT 10'
    ).fetchall())
    
    today_pages = con.execute(
        "SELECT COUNT(*) FROM page_events WHERE date(ts) = date('now')"
    ).fetchone()[0]
    
    con.close()
    
    return jsonify({
        'total_pages': total_pages,
        'total_messages': total_messages,
        'total_sessions': total_sessions,
        'today_pages': today_pages,
        'by_site': by_site,
        'top_urls': top_urls
    })


@app.route('/events/<int:event_id>', methods=['GET'])
def get_event(event_id):
    con = get_db()
    row = con.execute('SELECT id, ts, site, url, text_value FROM page_events WHERE id = ?', (event_id,)).fetchone()
    con.close()
    if not row:
        return jsonify({'error': 'not found'}), 404
    return jsonify(dict(row))


@app.route('/events/recent-context', methods=['GET'])
def recent_context():
    """
    Returns last N chat messages as a text block
    suitable for injecting into an Ollama prompt as context.
    Param: n (default 20)
    """
    n = int(request.args.get('n', 20))
    con = get_db()
    rows = con.execute('''
        SELECT ts, role, text_content
        FROM chat_messages
        ORDER BY id DESC LIMIT ?
    ''', (n,)).fetchall()
    con.close()

    lines = []
    for r in reversed(rows):
        role = r['role'].upper() if r['role'] else 'UNKNOWN'
        text = (r['text_content'] or '')[:300]
        lines.append(f"[{r['ts'][:19]}] {role}: {text}")

    return jsonify({'context': '\n'.join(lines), 'count': len(lines)})


@app.route('/ollama/ask', methods=['POST'])
def ollama_ask():
    """
    Ask Ollama a question using recent captured context as RAG.
    Body: { "question": "...", "context_n": 20 }
    """
    body     = request.get_json() or {}
    question = body.get('question', '').strip()
    if not question:
        return jsonify({'error': 'question required'}), 400

    n = int(body.get('context_n', 20))

    # Get recent context from both chat messages and page events
    con = get_db()
    
    # Chat messages
    chat_rows = con.execute('''
        SELECT ts, role, text_content
        FROM chat_messages
        ORDER BY id DESC LIMIT ?
    ''', (n,)).fetchall()
    
    # Page events (for activity context)
    page_rows = con.execute('''
        SELECT ts, site, url
        FROM page_events
        ORDER BY id DESC LIMIT ?
    ''', (n//2,)).fetchall()
    
    con.close()

    context_lines = []
    
    # Add chat context
    for r in reversed(chat_rows):
        role = r['role'].upper() if r['role'] else '?'
        text = (r['text_content'] or '')[:200]
        context_lines.append(f"[{r['ts'][:19]}] {role}: {text}")
    
    # Add page context
    for r in reversed(page_rows):
        context_lines.append(f"[{r['ts'][:19]}] Visited: {r['site']} - {r['url'][:80]}")

    context_text = '\n'.join(context_lines)

    prompt = (
        f"You are a personal assistant with access to the user's recent browser communication history.\n\n"
        f"RECENT ACTIVITY:\n{context_text}\n\n"
        f"USER QUESTION: {question}\n\n"
        f"Answer based on the activity above:"
    )

    try:
        payload = json.dumps({
            'model': OLLAMA_MODEL,
            'prompt': prompt,
            'stream': False,
            'options': {'temperature': 0.3}
        }).encode()
        req = urllib.request.Request(
            OLLAMA_URL, data=payload,
            headers={'Content-Type': 'application/json'}, method='POST'
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return jsonify({
                'answer': result.get('response', ''),
                'context_used': len(context_lines)
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print(f'[Browser Capture API] Starting on http://localhost:7070')
    print(f'[Browser Capture API] DB: {DB_PATH}')
    app.run(host='127.0.0.1', port=7070, debug=False)
