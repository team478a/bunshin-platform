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
