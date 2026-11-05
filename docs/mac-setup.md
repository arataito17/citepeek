# MacでWebサーバーを動かし、翻訳先を選ぶ

## Macだけで使う

```sh
npm ci
npm run build:local
npm run start:mac
```

WebサーバーはMacの `127.0.0.1:8765` で動きます。GPUのSSH接続・Ollama・モデル取得を待たずに起動します。画面の「無料翻訳を設定」から **ブラウザ内** を選び、有効にしてください。

ブラウザ内翻訳は、対応するChromeではTranslator API、それ以外ではOPUS-MTをWebAssemblyで実行します。推論はMac内で完結します。初回のライブラリ・モデル取得と、アブストラクトの文献検索にはインターネット接続が必要です。

配布ZIPの場合は展開後の `Start.command` を実行します。Node.js 22.13以上が必要で、依存パッケージのインストールは不要です。

## 翻訳だけGPUで実行する

GPU側では既存のOllamaとモデルを1組だけ使います。CitepeekのWebサーバーをGPU上で起動する必要はありません。

Macの別の端末で次を実行します。

```sh
npm run gpu:connect -- user@lab-gpu
```

これは次のSSH転送と同じです。

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:11435:127.0.0.1:11434 user@lab-gpu
```

Macの `start:mac` は既定で `CITEPEEK_OLLAMA_URL=http://127.0.0.1:11435` を使います。`.env.local` や環境変数で別の値を指定している場合は、11435番に合わせてください。

ブラウザの翻訳設定は次のとおりです。

| 項目 | 設定 |
| --- | --- |
| エンジン | Mac / GPUサーバー |
| ローカル接続先 | `http://127.0.0.1:8765` |
| モデル名 | GPU側に取得済みの名前。例：`translategemma:12b` |

GPU側に送るのは、選んだアブストラクトまたは本文です。モデルはGPU側に保存したままで、利用者ごとの追加ダウンロードはありません。

GPU接続を終了するときは、転送用の端末で `Ctrl+C` を押します。MacのWebサーバー・PDF閲覧は動いたままです。ブラウザ内翻訳へ戻す場合は、翻訳設定を切り替えて有効にします。

## Mac自身のOllamaを使う場合

MacでOllamaを動かしている場合は、`.env.local` に次を指定して起動し直します。

```dotenv
CITEPEEK_OLLAMA_URL=http://127.0.0.1:11434
```

## 従来の共有Web方式との違い

`npm run lab:connect` は、GPU側のWebサーバーをMacの8765番へ転送する従来のコマンドです。MacでWebを動かす方式では **`gpu:connect`** を使います。同じ8765番を使う従来のWeb転送は終了してからMac版を起動してください。

ネットワークが変わってもMacのWebサーバーのURLは同じです。GPU翻訳を使う場合だけ、VPN等でGPUへ到達できる状態にしてSSH転送を再接続します。
