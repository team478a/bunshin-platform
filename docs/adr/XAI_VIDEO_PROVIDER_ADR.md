# xAI動画生成Provider ADR

日付: 2026-11-18

## 決定

- xAI動画生成は既存 `VideoSceneGenerationProviderPort` のWeb Adapterとして実装し、SOCIAL DomainやApplicationへxAI固有HTTP仕様を入れない。
- `VideoAiProvider`へ`XAI`を追加し、既存の用途別 `AiProviderConfiguration` の `VIDEO_SCENE_GENERATION` を再利用する。model名と1秒あたりの見込原価は管理設定で保持し、Domainへ固定しない。
- Text-to-Videoは参照画像なし、Image-to-Videoは既存の非公開参照画像から作った短期署名URLの先頭1件を `image.url` として送る。複数画像を使うReference-to-Videoは今回の範囲外とする。
- 既存動画シーンが5秒または10秒であるため、xAIにも同じ長さだけを要求する。出力は縦型720pを基本とし、Text-to-Videoでは9:16、Image-to-Videoでは入力画像の比率をxAIへ継承させる。
- 有料POSTの直前に行う `SUBMISSION_UNKNOWN` claimをFAL専用から全動画Provider共通へ変更する。POST応答またはrequest ID保存の成否が不明な場合は自動再送しない。
- 完了照会で返る `usage.cost_in_usd_ticks` を、公式換算の `1 USD = 10^10 ticks` に従いUSD microsへ変換し、既存 `actualCostUsdMicros` に保存する。
- 出力URLはAdapterとStorageの両方で `https://vidgen.x.ai` に限定する。Storage取得はredirectを拒否し、100MB上限、MP4 Content-Type、`ftyp`シグネチャを検証して非公開bucketへ保存する。

## 理由

既存基盤には、非同期submit/inspect、外部Job ID、状態遷移、利用権限、費用上限、非公開Storage、字幕・編集・レンダリング接続がある。xAI固有の並行基盤を作るより、このPortとJobを拡張する方がProvider交換性と既存サービス継続性を維持できる。

xAI公式仕様は動画生成を非同期処理として定義し、`POST /v1/videos/generations`から`request_id`を返し、`GET /v1/videos/{request_id}`で照会する。Text-to-VideoとImage-to-Video、1〜15秒、720p、9:16、および完了応答の実請求額を提供している。現在の5秒・10秒動画はこの範囲内である。

## 対象外

- 実xAI APIへの有料呼び出しと品質評価
- Reference-to-Video、音声参照、keyframe、動画編集、動画延長
- 1080p生成
- 自動Provider選択
- 本番設定、migration、本番デプロイ

## 公式資料

- https://docs.x.ai/developers/rest-api-reference/inference/videos
- https://docs.x.ai/developers/model-capabilities/video/generation
- https://docs.x.ai/developers/model-capabilities/video/image-to-video
- https://docs.x.ai/developers/model-capabilities/video/overview
- https://docs.x.ai/developers/cost-tracking
- https://docs.x.ai/developers/pricing
