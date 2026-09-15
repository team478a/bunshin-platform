# Runway 動画生成接続 実装報告

## 完了範囲

- 管理画面で Runway のAPIキー、モデル、日次・月次予算、秒単価を登録できる。
- 動画を生成しない接続確認に成功した設定だけを使用中へ切り替えられる。
- 利用者はAI動画の場面作成時に `fal` または `Runway` を選べる。
- Runwayの画像から動画を作るAPIへ、縦型、5秒または10秒の場面を送信する。
- 非同期タスクを再開可能な既存Jobで確認し、成功・失敗・再試行を記録する。
- 完成したMP4を許可済みのRunway配信元から取得し、非公開Supabase Storageへ保存する。
- 既存のGroup利用権、生成上限、日次・月次予算、1場面上限、緊急停止をRunwayにも適用する。

## 対応モデル

- `gen4_turbo`
- `gen4.5`

初期値は原価を抑えやすい `gen4_turbo` とする。モデル名が上記以外の場合は、接続前に停止する。

## 外部仕様

- API version: `2024-11-06`
- 生成: `POST /v1/image_to_video`
- 状態確認: `GET /v1/tasks/{id}`
- 出力: 縦型 `720:1280`

参考: [Runway API Getting Started](https://docs.dev.runwayml.com/guides/using-the-api/)、[Runway SDK / Task](https://docs.dev.runwayml.com/api-details/sdks/)

## 運用開始に必要な設定

1. Runway DevでAPIキーとCreditsを準備する。
2. システム管理画面のAI設定でRunway、モデル、予算、秒単価を登録する。
3. 「この設定を使い始める」で接続確認を行う。
4. 対象Groupの動画生成権限と上限を確認する。
5. 少額の5秒動画を1件作り、画面で再生・保存できることを確認する。

APIキーを登録するまで外部接続は行われない。接続確認では有料生成を開始しない。
