# Social Platform / Format Expansion 実装報告

## 結果

FREE SOCIAL MVP Rebaselineで承認されたSNS候補とTEXT形式を、既存SOCIAL Foundationの型、DB、validation、HTTP/UIへ後方互換で追加した。

## 変更内容

- SocialPlatformへ`THREADS`と`YOUTUBE_SHORTS`を追加
- SocialPreferredFormatへ`TEXT`を追加
- TEXT MissionContentをformat別strict schemaとして追加
- SocialProfileのpreferredFormats上限を全5形式へ拡張
- SocialProfileとWeekly Planの既存API/UIが新しい値を扱えるよう更新
- PostgreSQL enumへ値を追加するforward migrationを追加
- 正本仕様のplatform / format一覧を更新

TEXT content:

```text
body
threadParts[0..25]
cta nullable
caption nullable
hashtags[0..30]
```

platform別EnumやProvider固有fieldは追加していない。X / Threads等の表現差は後続Generatorがplatform contextで決定する。

## 互換性

- 既存SocialProfile、WeeklyPlanItem、DailyMission、MissionContentの行は書き換えない
- 既存4形式と4platformの値・意味を変更しない
- enumへの値追加だけを行い、Primary SNS、Strategy、Decision、Activityは追加しない
- rollbackでPostgreSQL enum値を直接削除せず、必要時は依存データを確認したforward migrationでenumを再構築する

## 検証

- Prisma schema validate / generate: 成功
- 空PostgreSQLへ全10 migration適用: 成功
- capability-social unit: 13件成功
- web HTTP test: 19件成功
- database integration: 14件成功
- 対象package / web typecheck: 成功
- 対象file lint: 成功
- capability-social / database build: 成功
- git diff check: 成功

ローカルのweb buildは、別worktreeを参照する暫定`node_modules` junctionをTurbopackが拒否するため実行環境上完了できなかった。ソースの型検査とHTTP testは成功しており、通常の依存関係を取得するPR CIでweb buildを確認する。

## 対象外

Primary SNS、SocialAccountStrategy、MissionDecision、MissionActivity、PostRecord、Feedback、AI生成、SNS OAuth、自動投稿、自動metrics、画像・動画生成、LINE、BLOGは実装していない。
