# ラボ内で1つのGPU・モデルを共有する

## おすすめの構成

GPUサーバーに **Ollamaを1プロセス、モデルを1組、Citepeekを1プロセス** 用意します。利用者はCitepeekのWebポートを各自のPCにSSH転送します。各ユーザーが別々に `ollama serve` や `ollama pull` を実行する必要はありません。

同じGPUマシンの別アカウントや複数のブラウザからも、同じサーバーに接続できます。1つのモデルを複数リクエストで使い、各リクエストにはそれぞれ推論用のメモリが必要です。モデルファイルを人数分コピーすることとは別です。

共有Ollamaが既に動いている場合は **そのサービスを再利用** し、以下のインストール・モデル取得は省略してください。モデルの保存先をそろえるだけで複数のOllamaを起動すると、ディスクの重複を避けてもGPUメモリを余計に使う可能性があります。

## 管理者が一度だけ行う設定

Ollamaをインストールし、管理用アカウントで書き込める `/mnt` 内のモデル保存先を用意します。以下は `/mnt/citepeek/models` を使う例です。既存の保存先がある場合はそれを指定してください。

```sh
OLLAMA_HOST=127.0.0.1:11434 \
OLLAMA_MODELS=/mnt/citepeek/models \
OLLAMA_CONTEXT_LENGTH=8192 \
OLLAMA_NUM_PARALLEL=1 \
OLLAMA_MAX_LOADED_MODELS=1 \
OLLAMA_KEEP_ALIVE=15m \
ollama serve
```

上記が起動した状態で、別の端末から一度だけモデルを取得します。保存先はCLIを実行するアカウントではなく、接続したOllamaサーバーの設定で決まります。

```sh
OLLAMA_HOST=127.0.0.1:11434 ollama pull translategemma:12b
OLLAMA_HOST=127.0.0.1:11434 ollama list
```

常駐化する場合は、同じ環境変数をOllamaのサービス設定に指定します。既存のOllamaサービスが11434番を使用している場合はそのサービスを設定し、二重起動しません。保存先の変更だけでは既存モデルは移動しないため、最初から正しい保存先で起動するか、停止中に既存ファイルを移動します。

次にCitepeekをビルド・起動します。

```sh
npm ci
npm run build:local
npm run start:local
```

必要なら `.env.local.example` を `.env.local` にコピーし、Ollamaの接続先やWebポートを指定します。`.env.local` はGitには入りません。通常の共有構成は既定の8765番ポートを使います。

```sh
curl http://127.0.0.1:8765/api/health
```

`{"models":["translategemma:12b"]}` のような応答があれば、利用者にGPUサーバーへのSSH接続先を案内できます。SSH鍵は利用者自身のものを登録し、各自のSSHアカウントから使います。

## 利用者の接続

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 user@lab-gpu
```

各自のPCで `http://127.0.0.1:8765/` を開き、翻訳設定を「Mac / GPUサーバー」、モデルを `translategemma:12b` にします。アプリの接続先は `http://127.0.0.1:8765` のままです。PDF・文献の選択や翻訳結果の表示はブラウザごとに独立しています。

8765番が使用中なら、既存のCitepeekまたはSSH転送を確認します。同じ共有サーバーへの転送が既にあればそれを使えます。

## コードを各自のPCで変更する場合

Webサーバーは各自のPCで動かし、**Ollamaだけを共有** する構成も使えます。

1. GPUのOllamaを各自のPCの別ポートに転送します。

   ```sh
   ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:11435:127.0.0.1:11434 user@lab-gpu
   ```

2. 各自のコードで `.env.local` を作ります。

   ```dotenv
   CITEPEEK_PORT=8765
   CITEPEEK_OLLAMA_URL=http://127.0.0.1:11435
   ```

3. `npm ci`、`npm run build:local`、`npm run start:local` を実行します。

この場合もモデルはGPUにある1組を使い、各自のPCには入りません。同じPCで複数のCitepeekを動かす場合は `CITEPEEK_PORT` を分け、各ブラウザの翻訳設定もそのポートのURLに合わせます。

## 同時利用と運用

RTX 4090の24GBとTranslateGemma 12Bでは、まず `OLLAMA_NUM_PARALLEL=1` として、複数利用者のリクエストをOllamaの待ち行列で順番に処理する構成から始めます。同時利用時は単独利用より待ち時間が長くなります。GPUメモリに余裕があることを実測してから並列数を増やします。

アプリは翻訳を中断したブラウザのリクエストをOllamaにもキャンセルします。GPU版の翻訳タイムアウトは約230秒です。多数の利用でこれを超える場合は、待ち行列・並列数・モデルサイズを調整してください。

コードの更新は `git pull` → `npm ci` → `npm run build:local` → **CitepeekのWebプロセスだけ再起動** で行えます。Ollamaの再起動やモデルの再ダウンロードは不要です。共有Ollamaを停止すると全員の翻訳が止まるため、利用者の切断では自分のSSH転送だけを終了します。

OllamaとCitepeekはループバックで待ち受け、アクセスにはSSHを使います。この配布版はSSH転送を想定しており、LANへ直接公開する設定やWebログイン機能は含めていません。

## 参考資料

- [Ollama FAQ：保存先、接続先、並列リクエスト](https://docs.ollama.com/faq)
- [Ollama API](https://docs.ollama.com/api/introduction)
- [TranslateGemmaモデル](https://ollama.com/library/translategemma)
