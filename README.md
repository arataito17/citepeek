# Citepeek

PDFの引用番号に触れると、引用先論文のアブストラクトと日本語訳を表示する論文リーダーです。本文の一部をドラッグ選択して翻訳することもできます。GPT APIは使用しません。

## ラボで使う：モデルはGPUサーバーに1組だけ

```text
各自のブラウザ ─ SSH転送 ─┐
各自のブラウザ ─ SSH転送 ─┼─ Citepeek ×1 ─ Ollama ×1 ─ モデル ×1
各自のブラウザ ─ SSH転送 ─┘       同じGPUサーバー
```

利用者ごとにOllamaを起動したり、モデルをダウンロードしたりする必要はありません。管理者が共有サーバーを起動し、各自のSSHアカウントから接続します。GPUサーバー自身で使う場合も同じWebサーバーに接続できます。

### 利用者の接続

管理者からSSH接続先を受け取り、`user@lab-gpu` を置き換えます。

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 user@lab-gpu
```

端末を開いたまま、[http://127.0.0.1:8765/](http://127.0.0.1:8765/) を開きます。閲覧だけならコードの取得やNode.jsのインストールも不要です。終了は端末で `Ctrl+C`。

コードを取得済みでNode.jsがある場合は、同じ接続を次でも実行できます。依存パッケージのインストールは不要です。

```sh
npm run lab:connect -- user@lab-gpu
```

翻訳設定で **Mac / GPUサーバー** を選び、次を指定して **Ollamaに接続** を押します。

| 項目 | 設定値 |
| --- | --- |
| ローカル接続先 | `http://127.0.0.1:8765` |
| モデル名 | 管理者が用意した名前。現在の構成では `translategemma:12b` |

ブラウザ内翻訳を選ぶと、その端末で別の翻訳モデルを使います。共有GPUを使うときは上記の設定にしてください。

### 管理者・開発者

Node.js **22.13以上**とnpmを用意します。初回のコード取得はGitHubの **Code → Clone** のURLを使ってください。

```sh
git clone https://github.com/arataito17/citepeek.git
cd citepeek
npm ci
npm run build:local
npm run start:local
```

Webサーバーは `127.0.0.1:8765`、接続先のOllamaは `127.0.0.1:11434` が既定値です。Ollamaとモデルはこのコマンドではインストールしません。既に動いている共有Ollamaをそのまま利用できます。

詳しくは **[共有GPUの設定・モデルを重複させない方法](docs/lab-setup.md)** を参照してください。

## 操作

- テキストを含むPDFを選択します。PDF全体はブラウザで解析します。
- 引用番号をホバー・クリックすると右側に論文を表示します。`[1, 2, 3]` は各番号を選択できます。
- 本文をドラッグ選択すると「選択箇所」に原文と和訳を表示します。
- `→` / `Enter` で次ページ、`←` で前ページへ移動します。入力欄やボタンの操作中は通常のキー操作を優先します。
- PDF上部のボタン、PDF内のピンチ、`⌘` / `Ctrl` ＋ホイールで左のPDFだけ拡大縮小します。

## 文献検索と翻訳

DOI、arXiv ID、タイトルの順に照合し、Crossref、Semantic Scholar、OpenAlex、arXiv、Europe PMCなどから情報を取得します。ACMのDOIページも取得を試み、アクセス制限時は他の情報源の同じDOIに対応するアブストラクトを使用します。

スキャンPDF、著者年形式の引用、複雑な段組みは手動修正が必要な場合があります。API制限中やアブストラクトが公開されていない文献は取得できない場合があります。

翻訳にはローカルOllama、またはChrome Translator / OPUS-MTによるブラウザ内翻訳を使えます。ローカルモデルの推論にGPTのクレジットや翻訳API料金は発生しません。GPU等の計算資源と通信は利用環境のものを使います。

PDF全体はアプリのサーバーにアップロードしません。文献検索では参考文献の文字列・DOI等を検索APIに送り、GPU翻訳ではアブストラクトまたは選択した本文を共有GPUに送ります。翻訳キャッシュと設定は各ブラウザのローカルストレージに保存します。

## 開発と検証

```sh
npm test
npm run build:local
node scripts/test-translation-cancellation.mjs
```

ローカル版の生成物は `.sites-runtime/local/` です。このディレクトリをNode.jsがある別PCにコピーして `node server.mjs` で実行することもできます。モデルは含まれません。

`npm run dev` は元のVinext開発サーバー、`npm run build` はSites向けのビルドです。GPU版には `build:local` / `start:local` を使います。Sites開発の説明は [別ドキュメント](docs/sites-development.md) にあります。

## 共有するファイル

GitHubにはソース、lockfile、接続スクリプト、手順を置きます。モデル、SSH鍵、`.env.local`、生成物は含めません。第三者ソフトウェアの表示は [local/THIRD-PARTY.txt](local/THIRD-PARTY.txt) と各vendorのライセンスを参照してください。モデルの利用条件は各配布元に従います。
