import {access} from 'node:fs/promises';
const server=new URL('../.sites-runtime/local/server.mjs',import.meta.url);
try{await access(server);}catch{
  console.error('ローカル版がありません。先に npm run build:local を実行してください。');
  process.exit(1);
}
await import(new URL('../.sites-runtime/local/start.mjs',import.meta.url).href);
