# BUNSHIN Platform Agent Instructions

このファイルはCodex、Claude Code、その他AI開発エージェントに適用するリポジトリ共通ルールです。

## 1. Source of Truth

実装仕様の正本は次です。

`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`

補助文書:

- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/PHASE0_EXECUTION_GUIDE.md`
- `docs/DECISION_LOG.md`

仕様と実装が矛盾する場合、勝手に仕様を簡略化しないでください。差分・理由・選択肢を報告し、必要なら先に文書を更新してください。

## 2. Absolute Architecture Rules

以下は破ってはいけません。

1. `1 User : N Bunshin` を前提にする
2. UserとBunshinを同一エンティティとして扱わない
3. Bunshinごとに目的、人格、知識、Memory、Channel、Mission、Performanceを分離する
4. 異なるBunshin間でMemoryや投稿履歴を暗黙共有しない
5. Workspace/Userを越えるデータ参照を許可しない
6. SOCIALやBLOGをBunshin本体に直書きせず、Capabilityとして分離する
7. OpenAI、Gemini、LINE、Canva、SNS等のProvider依存をCoreへ混ぜない
8. 既存 `bunshin-blog` を捨てる前提で設計しない

## 3. Current Priority

Phase 0の監査とPhase 1のPlatform Foundationは完了しています。Phase 2を開始する前に`docs/PHASE1_IMPLEMENTATION_REPORT.md`とDraft PRのレビューを受けてください。

レビュー完了前にBunshin、SOCIAL画面、AI投稿生成、LINE配信、BLOG移行、自動投稿、動画生成へ進まないでください。

## 4. Scope Discipline

MVP外の機能を先回りして実装しないでください。

初期MVP対象外:

- SNS完全自動投稿
- 自前動画生成
- Canva完全連携
- 高度SNS分析API
- コメント自動返信
- AI電話
- リスト収集
- 営業自動化
- LP自動生成
- 高度紹介報酬

将来接続できる境界やinterfaceは設計しても、実体は作らないでください。

## 5. Development Standards

- TypeScriptを標準とする
- 厳格な型付けを維持する
- lint / typecheck / test / buildを継続して通す
- DB変更にはmigrationを含める
- API入力にはvalidationを入れる
- cron/jobは冪等にする
- 秘密情報をリポジトリへコミットしない
- エラーを握りつぶさない
- AI処理にはモデル、Prompt Version、使用量、原価、処理時間、成否を記録する

## 6. Testing Priorities

最低限、次を自動テストしてください。

- User AからUser Bのデータを参照できない
- Bunshin AからBunshin BのMemoryを参照できない
- 同一日・同一Bunshinに重複Missionを生成しない
- Capability未付与のBunshinは該当機能を実行できない
- 投稿生成失敗時に不完全データを公開しない
- Provider障害時に再試行・失敗状態を正しく残す

## 7. Work and Reporting Format

各Phaseで以下を報告してください。

1. 調査した内容
2. 変更したファイル
3. 主要な設計判断
4. 実行した検証
5. 未解決事項
6. 次Phaseへ進める条件

大きな判断は `docs/DECISION_LOG.md` またはADRとして記録してください。

## 8. Branch and Commit

- 原則としてPhaseまたは明確な作業単位でブランチを分ける
- 変更範囲を小さく保つ
- 無関係な修正を同じPRへ混ぜない
- PR本文に目的、変更内容、検証、残課題を記載する

## 9. User Experience Principle

通常の多機能SaaS画面を作らず、スマートフォンとLINE起点で「今日やること」が明確なUXを優先してください。

ユーザーに機能を選ばせるのではなく、Bunshinが目的・時間・顔出し可否・履歴を基に実行可能なDaily Missionを決める設計です。
