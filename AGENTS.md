# BUNSHIN Platform Agent Instructions

このファイルはCodex、Claude Code、その他AI開発エージェントに適用するリポジトリ共通ルールです。

## 1. Source of Truth and Document Status

実装仕様の正本は次です。

`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`

常に有効な設計原則:

- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/DECISION_LOG.md`

現在の実装状況と次の作業:

- `docs/IMPLEMENTATION_ROADMAP.md`
- 対象機能の最新の実装報告、監査報告、運用Runbook

`PHASE*`文書と過去の実装報告は判断経緯を残す履歴です。最新文書や現在のコードと矛盾する古い停止条件を、全開発を止める現行条件として扱わないでください。実装済み、検証済み、本番反映済みは別の状態として記録し、PRマージを本番反映の証拠にしないでください。

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

## 3. Change Preparation

変更前に最低限、次を確認してください。

- `AGENTS.md`
- `docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`
- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DECISION_LOG.md`
- 対象機能の最新文書、関連テスト、packageの公開入口

現在のコードだけを正しい仕様と仮定せず、文書・テスト・稼働状況との差分を確認してください。大きな判断は実装前にDecision LogまたはADRへ記録します。

## 4. Scope and Status Discipline

MVP外の機能を先回りして実装しないでください。

対象外の機能を先回りせず、依頼された作業単位を小さく保ってください。古いMVP一覧を現在の実装可否の根拠にせず、`docs/IMPLEMENTATION_ROADMAP.md`と最新の機能文書を確認します。

報告では次を区別します。

- 実装済み: コードと必要なmigrationが存在する
- 検証済み: 指定された自動・手動検証の証拠がある
- 本番反映済み: production SHAと本番環境での確認証拠がある

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
- package間参照は各`package.json`の`exports`を通し、`src`内部や相対パスで公開入口を迂回しない
- `platform-domain`、`shared`、`capability-contract`からWeb/DB実装へ依存しない
- `application`からPrisma、Next.js/React、個別Provider実装へ直接依存しない
- `database`がapplication/capabilityのPortを実装する依存と、`apps/web`のcomposition rootでの組み立ては許可する

標準検証コマンド:

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

`pnpm lint`は実コードの依存境界を、`pnpm test`は境界検査自体の否定テストを含みます。

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

## 10. Parallel Work

複数のエージェントが同時に作業する場合は、`docs/CODEX_PARALLEL_WORK_RULES.md` に従ってください。特に次を守ります。

- 1タスク＝1ブランチ＝1PR。指示書の「触ってよい範囲」以外を変更しない
- 共有ファイル（DECISION_LOG、IMPLEMENTATION_ROADMAP、各packageの`src/index.ts`、`vercel.json`の`crons`、環境変数定義など）は追加のみとし、変更した場合は報告に「共有ファイルの変更」として明記する
- migrationは指示書で許可されたタスクだけが作る。許可なく必要になったら作らずに報告して止まる
- 先に別のPRがmainへマージされたら、rebaseして標準検証をやり直してから報告を更新する

## 11. Usability and Proportionate Controls

使いやすさと通常利用の継続を優先し、不要な監査機能・確認操作・極端な利用制限を追加しないでください。

- 監査・負荷制限・原価制限は、まず既存機能を再利用する。将来の抽象的なリスクだけを理由に、専用台帳、管理画面、承認フロー、停止条件を増やさない。
- 新しい制御が必要な場合は、解決する具体的な問題、既存機能で不足する理由、通常利用への影響をPRで簡潔に説明する。この説明のための新しい承認画面や手続きを作らない。
- 回数・並行数・タイムアウトは、実測、公式の上限、具体的な費用予算等を根拠に決める。根拠のない短時間タイムアウトや一律の低い上限を採用しない。必要な制限は対象を絞り、実態に応じて調整できるようにする。
- 共通の接続先やサービス全体への制限で、一部ユーザーの利用が他の正常なユーザーまで不必要に停止させないようにする。閲覧・再試行・設定変更の通常操作に不要な確認を重ねない。
- 利用計測や分析用ログの保存失敗だけで通常の閲覧を停止しない。権限変更、特典付与、外部書込み等に必要な証跡とは責務を分け、必要最小限の情報を既存の記録先へ残す。秘密情報や本文を過剰に保存しない。
- Workspace / Service / User / Bunshin間のデータ分離、所有権・認証・権限検証、本人による接続解除、書込み・特典付与の冪等性、外部操作に必要な明示承認は維持する。利用しやすさを理由にこれらを無効化しない。
- この方針は新たな監査・制限の追加を正当化するものではない。既存の過剰な制御を修正するときも、影響する機能と必要な保護を確認し、対象を絞って変更する。

方針の経緯と旧計画の扱いは`docs/DECISION_LOG.md`の2026-11-03「使いやすさと必要最小限の制御」を参照してください。
