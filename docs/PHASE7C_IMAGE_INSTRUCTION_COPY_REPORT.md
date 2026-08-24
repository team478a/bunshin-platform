# Phase 7-C 画像制作指示コピー 実装報告

## 目的

画像形式のMissionで、利用者が外部の画像AIや制作サービスへ渡す説明を、投稿文と混同せずコピーできるようにする。

## 実装内容

- 完成版に「画像を作るための説明をコピー」を追加した。
- 画像制作指示のコピーを`COPIED_IMAGE_INSTRUCTION`として記録する。
- 投稿文コピーは既存の`COPIED_TEXT`を維持する。
- 支援レベル別KPI、LINE Funnel、利用者詳細、トレンドKPIのCopy集計へ新イベントを含めた。
- Prisma enum追加migrationを用意した。

## 安全性

- Activityにはイベント種別、時刻、scope、冪等キーだけを保存する。
- 画像制作指示、投稿文、Knowledge、秘密値をActivity metadataやlogへ保存しない。
- 既存のverified session、Workspace／User／Bunshin／Mission scope検証を再利用する。

## 非対象

- 画像本体の生成
- 外部画像Providerへの自動送信
- SNSへの自動投稿
