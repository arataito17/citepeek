#!/bin/zsh
set -e
cd -- "${0:A:h}"
node_bin="$(command -v node || true)"
if [[ -z "$node_bin" && -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ -z "$node_bin" ]]; then
  echo 'Node.js 22.13以降を https://nodejs.org/ からインストールしてください。'
  read '?Enterで閉じる'
  exit 1
fi
echo 'MacでWebサーバーを起動します。ブラウザで http://127.0.0.1:8765/ を開いてください。'
echo 'ブラウザ内翻訳はGPU接続不要です。GPU翻訳は別途11435番へSSH転送してください。'
exec "$node_bin" --env-file-if-exists=.env.local start.mjs
