#!/usr/bin/env python3
"""Citepeek → local Ollama bridge. Python 3.9+, standard library only."""
import argparse
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from threading import BoundedSemaphore

SITE = 'http://localhost:8765'
ORIGINS = {SITE, 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:8765'}
ORIGINS.update(x.strip() for x in os.getenv('CITEPEEK_ALLOWED_ORIGINS', '').split(',') if x.strip())
OLLAMA = os.getenv('CITEPEEK_OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
if urlsplit(OLLAMA).hostname not in {'localhost', '127.0.0.1', '::1'}:
    raise SystemExit('CITEPEEK_OLLAMA_URL must be loopback. Use an SSH tunnel for a GPU server.')
SLOTS = BoundedSemaphore(2)

def ollama(path, body=None, timeout=15):
    req = Request(OLLAMA + path, data=json.dumps(body).encode() if body else None,
                  headers={'Content-Type': 'application/json'})
    with urlopen(req, timeout=timeout) as r:
        return json.load(r)

def local_models():
    # Cloud tags must not silently route a supposedly local translation to billing.
    return [m['name'] for m in ollama('/api/tags').get('models', [])
            if not m.get('remote_host') and not m.get('remote_model') and 'cloud' not in m.get('name', '').lower()]

def translate(text, model):
    if not isinstance(text, str) or not 1 <= len(text) <= 20000:
        raise ValueError('アブストラクトは1〜20000文字で指定してください。')
    if not isinstance(model, str) or not re.fullmatch(r'[a-zA-Z0-9_.:/-]{1,120}', model):
        raise ValueError('モデル名が不正です。')
    if model not in local_models():
        raise ValueError('指定されたローカルモデルがありません。ollama pullで取得してください。')
    # TranslateGemma's documented single-user-message prompt format.
    prompt = ('You are a professional English (en) to Japanese (ja) translator. '
              'Your goal is to accurately convey the meaning and nuances of the original English text '
              'while adhering to Japanese grammar, vocabulary, and cultural sensitivities.\n'
              'Produce only the Japanese translation, without any additional explanations or commentary. '
              'Please translate the following English text into Japanese:\n\n\n' + text)
    value = ollama('/api/chat', {'model': model, 'messages': [{'role': 'user', 'content': prompt}],
                               'stream': False, 'options': {'temperature': 0, 'num_predict': 4096}}, 230)
    output = value.get('message', {}).get('content', '').strip()
    if not output:
        raise ValueError('翻訳結果が空でした。モデルを確認してください。')
    if value.get('done_reason') == 'length':
        raise ValueError('翻訳の出力上限に達しました。短いアブストラクトで再試行してください。')
    return output

class Handler(BaseHTTPRequestHandler):
    def allowed(self):
        origin = self.headers.get('Origin')
        host = self.headers.get('Host', '').split(':')[0]
        return host in {'127.0.0.1', 'localhost'} and (not origin or origin in ORIGINS)
    def send(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_OPTIONS(self):
        self.send(200 if self.allowed() else 403, {})
    def do_GET(self):
        if not self.allowed(): return self.send(403, {'error': 'Origin not allowed'})
        if self.path != '/api/health': return self.send(404, {'error': 'Not found'})
        try: self.send(200, {'models': local_models(), 'provider': 'local-ollama'})
        except (URLError, TimeoutError, OSError): self.send(503, {'error': 'Ollamaに接続できません。Ollamaの起動またはSSH転送を確認してください。'})
    def do_POST(self):
        if not self.allowed(): return self.send(403, {'error': 'Origin not allowed'})
        if self.path != '/api/translate': return self.send(404, {'error': 'Not found'})
        if not SLOTS.acquire(blocking=False): return self.send(429, {'error': '翻訳処理中です。少し待って再試行してください。'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 80000: return self.send(413, {'error': 'Request too large'})
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict): raise ValueError('JSON object required')
            self.send(200, {'translation': translate(body.get('text'), body.get('model', 'translategemma:4b'))})
        except (ValueError, TypeError): self.send(400, {'error': '文面またはモデル名を確認してください。ローカルモデルの取得が必要です。'})
        except HTTPError as e: self.send(502, {'error': f'Ollamaがエラーを返しました (HTTP {e.code})。モデルを確認してください。'})
        except (URLError, TimeoutError, OSError): self.send(503, {'error': 'Ollamaへ接続できないか、翻訳がタイムアウトしました。'})
        finally: SLOTS.release()
    def log_message(self, fmt, *args):
        # Never log abstracts or prompts.
        print(fmt % args)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    print(f'Citepeek bridge: http://127.0.0.1:{args.port} → {OLLAMA}')
    print('Press Ctrl+C to stop. Open Citepeek and choose Mac / GPUサーバー.')
    try: ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
    except KeyboardInterrupt: print('\nStopped.')
