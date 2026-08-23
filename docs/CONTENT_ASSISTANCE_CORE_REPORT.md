# 投稿支援レベル Core 実装報告

## 1. 目的

投稿先、投稿方法とは別に、BUNSHINがどこまで作るかをSocialProfileの初期値とDailyMissionの生成時記録として保持する。

## 2. 実装範囲

- `IDEA_ONLY | GUIDED | READY_TO_USE`のDomain enumとvalidation
- SocialProfileの`defaultAssistanceLevel`
- DailyMissionの`assistanceLevel` snapshot
- 既存データを`READY_TO_USE`として維持するmigration
- Prisma Repository mapping
- Daily Mission AI生成時に選択SocialProfileの初期値をsnapshot
- Domain、Persistence、Isolationのテスト

## 3. 設計判断

- 初期推奨と既存データの互換値は`READY_TO_USE`とする。
- 希望はSNSごとに異なり得るためSocialProfileへ保存する。
- 過去Missionの意味を初期値変更で変えないためDailyMissionへsnapshotを保存する。
- 投稿形式、MissionContent、Mission lifecycle、採用判断の意味は変更しない。
- 第1段階では既存の完全なMissionContent生成とatomic保存を維持する。

## 4. 今回実装しないもの

- 初期設定API/UI
- Mission画面の企画・作り方・完成版表示
- 支援レベルActivity
- SNS別投稿セット強化
- LINE通知変更
- AI段階生成

## 5. 次へ進む条件

本変更のMigration、既存データ互換性、SocialProfileとDailyMissionの責務分離がレビュー・承認された後、初期設定API/UIへ進む。

## 6. 検証

- Prisma Schema validation
- TypeScript typecheck
- ESLint
- 通常テスト
- Production build
- Prettier check
- `git diff --check`

DB統合テストは本番DBへ接続せず、CIの一時Postgresで実行する。
