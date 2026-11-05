import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

class FakeOllama(BaseHTTPRequestHandler):
    last = None
    def log_message(self, *args): pass
    def do_GET(self):
        data = {'models':[{'name':'translategemma:4b'},{'name':'remote:cloud','remote_host':'cloud'}]}
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(data).encode())
    def do_POST(self):
        FakeOllama.last = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps({'message':{'content':'これは翻訳のテストです。'},'done_reason':'stop'}).encode())

class BridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake=ThreadingHTTPServer(('127.0.0.1',0),FakeOllama)
        threading.Thread(target=cls.fake.serve_forever,daemon=True).start()
        os.environ['CITEPEEK_OLLAMA_URL']=f'http://127.0.0.1:{cls.fake.server_port}'
        spec=importlib.util.spec_from_file_location('bridge',Path(__file__).parent.parent/'companion/citepeek_bridge.py')
        cls.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.module)
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),cls.module.Handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls): cls.server.shutdown();cls.fake.shutdown();cls.server.server_close();cls.fake.server_close()
    def test_health_filters_cloud(self):
        with urlopen(self.base+'/api/health') as r: self.assertEqual(json.load(r)['models'],['translategemma:4b'])
    def test_cors_translation_prompt_and_response(self):
        req=Request(self.base+'/api/translate',data=json.dumps({'text':'Test abstract.','model':'translategemma:4b'}).encode(),headers={'Content-Type':'application/json','Origin':self.module.SITE})
        with urlopen(req) as r:
            self.assertEqual(r.headers['Access-Control-Allow-Origin'],self.module.SITE)
            self.assertEqual(json.load(r)['translation'],'これは翻訳のテストです。')
        self.assertFalse(FakeOllama.last['stream'])
        self.assertTrue(FakeOllama.last['messages'][0]['content'].endswith('\n\n\nTest abstract.'))
    def test_untrusted_origin_is_rejected(self):
        with self.assertRaises(HTTPError) as e: urlopen(Request(self.base+'/api/health',headers={'Origin':'https://untrusted.example'}))
        self.assertEqual(e.exception.code,403)
    def test_cloud_model_is_rejected(self):
        with self.assertRaises(ValueError):self.module.translate('Hello','remote:cloud')
    def test_malformed_body_is_rejected(self):
        with self.assertRaises(HTTPError) as e:urlopen(Request(self.base+'/api/translate',data=b'[]'))
        self.assertEqual(e.exception.code,400)
if __name__=='__main__':unittest.main()
