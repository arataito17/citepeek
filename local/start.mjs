process.env.CITEPEEK_OLLAMA_URL||='http://127.0.0.1:11435';
console.log('WebサーバーをこのMacで起動します。GPU接続は起動条件ではありません。\nブラウザ内翻訳はこのMacで計算します。GPU翻訳を使う場合のみ11435番へSSH転送してください。');
await import('./server.mjs');
