# マナベルスタイル PR-1 ブラウザ操作基盤

Phase 0 の再利用調査と設計判断は [ADR](../adr/MANABERU_BROWSER_WORKER_PR1.md) を参照。

## OSS 技術検証

| OSS                                                                          | 版と採否                                                               | 依存・商用配布時の条件                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Playwright](https://github.com/microsoft/playwright/releases/tag/v1.65.1)   | 1.65.1 を固定採用                                                      | 同版の playwright-core、同版 Docker イメージの Chromium、Node 24。Apache-2.0 の表示義務と、配布するブラウザ・イメージの同梱ライセンスを確認する                                                                                             |
| [Stagehand](https://registry.npmjs.org/@browserbasehq%2fstagehand/4.4.0)     | 4.4.0 を PR-2 の候補として調査                                         | MIT。Node 22.18 以上、同梱のブラウザ拡張、CDP、Browserbase SDK に依存。探索モデルを既存 AI 利用枠へ接続できるか PR-2 で確認する                                                                                                             |
| [Mimik](https://github.com/westpoint-io/mimik/releases/tag/desktop-v1.2.0)   | Desktop v1.2.0 を調査。コード未採用                                    | MIT。クリック記録、注釈・拡大、Smart blur、任意の説明生成、編集、音声付き動画と zip ベースの `.mimik` を確認。部分利用時は対象コミットと依存を固定し、著作権・ライセンス表示を保持する。ぼかしは iframe / Shadow DOM / 画像内文字を覆わない |
| [Browser Use](https://github.com/browser-use/browser-use/releases/tag/1.0.8) | 1.0.8 を比較候補として調査。未導入                                     | MIT。Python とモデル・ブラウザ用ランタイムを追加する構成。ホストサービスの条件は別途確認する                                                                                                                                                |
| [Sharp](https://sharp.pixelplumbing.com/install/)                            | 既存 Web の 0.35.4 を PR-3 の再利用候補とする                          | Apache-2.0。libvips と配布バイナリのライセンスを確認する                                                                                                                                                                                    |
| [FFmpeg](https://ffmpeg.org/legal.html)                                      | [9.1](https://ffmpeg.org/download.html) を将来の候補として調査。未導入 | ビルド構成により LGPL/GPL 等が異なる。配布するビルドの外部ライブラリ、ソース提供条件、コーデックの権利を確認する                                                                                                                            |
| [tsx](https://github.com/privatenumber/tsx)                                  | 4.23.15 を固定採用                                                     | MIT。内部依存 esbuild。ワークスペース package の TypeScript 公開入口を独立 worker から使うために利用する                                                                                                                                    |

Mimik の参照候補は [操作イベント・説明](https://github.com/westpoint-io/mimik/tree/desktop-v1.2.0/packages/core/src/capture)、[マスキング](https://github.com/westpoint-io/mimik/tree/desktop-v1.2.0/packages/core/src/blur)、[エクスポート](https://github.com/westpoint-io/mimik/tree/desktop-v1.2.0/packages/core/src/export)。画像加工、形式の互換性、音声や動画の部分採用は各対象 PR で検証する。

許可した合成ページと合成入力を使う。検証データだけをステップ ID ごとの前後 PNG、短いアクセシビリティ情報、実行時間として保存する。AI 呼び出しは 0 回。

## 実行

Node 24、ルートで `pnpm install --frozen-lockfile` を実行する。

```sh
pnpm --filter @bunshin/browser-worker exec playwright install chromium
pnpm --filter @bunshin/browser-worker start smoke mobile
pnpm --filter @bunshin/browser-worker start smoke desktop
```

出力先はアプリ内の `.e2e/browser-evidence`。変更する場合は `BROWSER_WORKER_OUTPUT` に非公開のディレクトリを設定する。証拠は成功条件の確認後に確定する。

```sh
docker build -f apps/browser-worker/Dockerfile -t bunshin-browser-worker .
curl -fsSLO https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/utils/docker/seccomp_profile.json
docker run --rm --init --network none --shm-size=256m \
  --security-opt seccomp=seccomp_profile.json bunshin-browser-worker smoke mobile
```

Linux の Chromium sandbox を有効にする。画像を取り出す場合は `--rm` を外してコンテナに名前を付け、停止後に `docker cp` で `/evidence` を取得する。

## 開発 DB のジョブ

使い捨て PostgreSQL に既存 migration を適用し、`pnpm db:generate` を実行する。開発テスト用の接続先を `BROWSER_FIXTURE_DATABASE_URL` に設定する。Workspace ID と Actor ID は既存の有効な Workspace メンバーの UUID を使う。CLI は運用者向けで、受講者向けの受付・認可は後続 PR で接続する。

```sh
pnpm --filter @bunshin/browser-worker start enqueue "$WORKSPACE_ID" "$ACTOR_ID" mobile "$REQUEST_ID"
pnpm --filter @bunshin/browser-worker start once
pnpm --filter @bunshin/browser-worker start serve
pnpm --filter @bunshin/browser-worker start cancel "$WORKSPACE_ID" "$ACTOR_ID" "$JOB_ID"
```

同じ要求 UUID を再送すると同じジョブ ID を返す。再実行を指示する場合は新しい要求 UUID を指定する。待機中のキャンセルは既存ジョブ処理を再利用する。実行中に worker へ SIGTERM を送ると Chromium を閉じ、その試行を再試行可能な状態にする。作業証拠はローカルの Workspace / Job / Attempt ディレクトリに保存し、ジョブ結果は PostgreSQL の状態を参照する。

`BROWSER_WORKER_CONCURRENCY` の既定値は 1 プロセスあたり 1。複数プロセスでは PostgreSQL のリースで同一ジョブの取得を排他化する。`BROWSER_WORKER_TIMEOUT_MS`（既定 30,000）と `BROWSER_WORKER_MAX_STEPS`（既定 20）は検証用の初期値で、4 ステップのサンプルやローカル起動コストを基準に調整する。

## 開発時点の検証

- Windows 上の Chromium 159.0.8154.6 でデスクトップ・モバイルの 4 ステップを再生。前後画像の PNG 署名と差分、遷移先、入力値、プレビュー表示を検証した。成功条件が画面と一致しない場合は成功扱いにならない。
- モバイルの単体サンプルは 5,844 ms。メモの入力、プレビュー、注意点へのスクロールを実際に操作し、前後 8 枚と証拠 JSON を保存した。
- 使い捨て PostgreSQL 16.15 へ main の既存 migration を適用。同じ要求の 2 回投入で同一 ID を返し、1 試行で SUCCEEDED となった。別ジョブの待機中キャンセルは CANCELLED となった。
- Stagehand 4.4.0 の Windows 検証ではローカル Chromium を起動し、Playwright の CDP 接続まで確認した。`Stagehand.create` は初期化でタイムアウトしたため、操作探索への採用判断は保留。
- AI 呼び出し 0 回、AI 原価 0 円。VPS 上の負荷と実外部サービスに対する再実行成功率は未計測。

## 次の作業

Stagehand の操作候補を検証済み操作に変換する接続、再利用可能なレシピ・教材の永続化、外部サイト向け隔離、受講者向け受付・教材表示、実 VPS での容量計測は後続。開発ジョブの合成画面の再生件数は、外部サイトでの再実行成功率の根拠にしない。
