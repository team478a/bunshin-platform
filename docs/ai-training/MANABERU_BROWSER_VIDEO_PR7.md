# マナベルスタイル PR-7 画像付き教材の動画化

[設計判断](../adr/MANABERU_BROWSER_VIDEO_PR7.md)

開発用 Web で画像付き教材を開き、「この教材を動画にする」を選ぶ。既存ブラウザワーカーの `serve` または `once` が非同期に生成する。準備ができたら同じページから再生、字幕表示、MP4 保存ができる。Workspace の個人ライブラリでは記録者本人、個別研修では該当 Program の受講者が利用する。

保存済みの操作前後と拡大画像を手順順に組み合わせる。記録に画像がない手順は説明の字幕を表示する。出力は720×1280の縦型 MP4（H.264）、日本語字幕とチャプター。教材版と生成形式が同じ依頼は、保存済みの動画を再利用する。Web 再生では字幕・チャプターを WebVTT で配信する。

開発用 DB に migration を適用し、Web とワーカーの `APP_ENV=development` を設定する。ワーカーに libx264 対応 FFmpeg を用意する。Dockerfile は Ubuntu の FFmpeg パッケージを利用する。開発機の別の実行ファイルを使う場合は `BROWSER_FFMPEG_PATH`、重い教材の生成時間は既存の `BROWSER_WORKER_TIMEOUT_MS` で設定できる。動画は30手順、8 MiB 以下を扱う。

Sharp 0.35.4（Apache-2.0）を引き継ぎ、FFmpeg はコマンドとして利用する。検証用 Windows の実行ファイルは FFmpeg 9.0.2 full build、libx264 を含む。ライセンスはビルド設定に依存する。生成に AI API を呼ばないため、AI 原価は0円。 [FFmpeg の公式文書](https://ffmpeg.org/ffmpeg.html) · [FFmpeg のライセンス](https://ffmpeg.org/legal.html)

初期版は画面証拠を使う字幕付き動画。連続したブラウザ録画の取り込み、音声ナレーション、本番公開は対象外。

Mimik Desktop v1.2.0（MIT）の書き出しコードでは、各手順のタイムラインと撮影画像の拡大を分けて扱う。今回も手順の尺を正本に字幕とチャプターを合わせ、既存の拡大画像を利用した。 [Mimik の動画書き出し](https://raw.githubusercontent.com/westpoint-io/mimik/desktop-v1.2.0/packages/core/src/export/video-export.ts)

## 開発検証

保存済みの Chromium 画像を使う教材を実 FFmpeg で描画した。ffprobe で720×1280、8秒、H.264、日本語字幕トラック、4秒ずつのチャプター2件を確認した。

## 日本語ナレーション

動画形式 v2 は、手順説明を Open JTalk で読み上げ、日本語 AAC を MP4 に追加する。字幕とチャプターは読み上げ時間に合わせて延長する。すでに生成済みの v1 は再生を続けられ、同じ教材ページから音声付きの v2 を生成できる。

Docker では Ubuntu 24.04 の Open JTalk と NAIST 辞書（パッケージ版 1.11-5）、NIT ATR503 M001 音声（パッケージ版 1.05-8）を使用する。Open JTalk は修正 BSD ライセンス、音声モデルは CC BY 3.0。音声の出典を教材ページと MP4 メタデータに表示する。Docker 外では必要に応じて `BROWSER_OPEN_JTALK_PATH`、`BROWSER_OPEN_JTALK_DICTIONARY`、`BROWSER_OPEN_JTALK_VOICE` を設定する。v3 の Mei 音声を Docker 外で使う場合は `BROWSER_OPEN_JTALK_MEI_VOICE` に `mei_normal.htsvoice` のパスを指定する。合成はワーカー内で完結し、外部 API の原価は0円。 [Open JTalk](https://open-jtalk.sourceforge.net/) · [音声モデルの条件](https://open-jtalk.sourceforge.net/readme_hts_voice_nitech_jp_atr503_m001.php)

## ステージングで志織・大智を使う

ステージングの管理者は「AIと検索サービスの設定 → Azure Speechの設定」で、対象ワークスペース、Azureリージョン、テスト用 Free (F0) リソースの接続キーを登録する。接続確認では音声一覧だけを取得する。F0 の契約は Azure 側で確認する。「試聴音声を作る」で固定文を志織・大智で1回ずつ合成し、保存した音声を教材画面で再利用する。

ブラウザワーカーの既存の `BROWSER_FIXTURE_MODEL_ORIGIN` と `BROWSER_FIXTURE_MODEL_SECRET` を使う。以前の Azure 用環境変数は管理画面の設定に移す。接続キーは既存の `ENCRYPTION_KEY` で暗号化し、Web と Azure 間だけで使う。実教材では有効なジョブの手順文を合成する。利用台帳にモデル・処理時間・成否を記録し、送信文字数は実行ログで確認できる。 [Azure Speech料金](https://azure.microsoft.com/ja-jp/pricing/details/speech/)
