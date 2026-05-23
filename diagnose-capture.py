import sqlite3, os
from datetime import datetime

db = os.path.join(os.environ['APPDATA'], 'BrowserCapture', 'capture.db')
con = sqlite3.connect(db)

print('=== BROWSER CAPTURE DIAGNOSTIC ===\n')

# Check for ChatGPT/Claude page visits in last 10 minutes
print('--- Recent page visits (last 20) ---')
rows = con.execute('SELECT ts, site, url FROM page_events ORDER BY id DESC LIMIT 20').fetchall()
for r in rows:
    ts = r[0][:19] if r[0] else 'N/A'
    site = r[1] if r[1] else 'unknown'
    url = r[2][:50] if r[2] else '?'
    print(f'{ts} | {site:12} | {url}')

print('\n--- Chat sites visited ---')
chat_sites = con.execute("SELECT DISTINCT site FROM page_events WHERE site IN ('chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai')").fetchall()
if chat_sites:
    for site in chat_sites:
        count = con.execute('SELECT COUNT(*) FROM page_events WHERE site = ?', (site[0],)).fetchone()[0]
        print(f'  {site[0]}: {count} page visits')
else:
    print('  No direct chat site visits found - checking URLs...')
    urls = con.execute("SELECT DISTINCT url FROM page_events LIMIT 30").fetchall()
    print(f'  Total unique pages: {len(urls)}')

print('\n--- Chat message capture status ---')
messages = con.execute('SELECT COUNT(*) FROM chat_messages').fetchone()[0]
print(f'  Total chat messages: {messages}')

sessions = con.execute('SELECT COUNT(*) FROM chat_sessions').fetchone()[0]
print(f'  Total chat sessions: {sessions}')

print('\n--- Check schema tables ---')
tables = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print(f'  Tables: {", ".join([t[0] for t in tables])}')

con.close()
