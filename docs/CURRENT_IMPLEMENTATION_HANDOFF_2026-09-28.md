# 現行実装状況・引継ぎ監査

- 監査日: 2026-09-28（Asia/Tokyo）
- 対象: `origin/main` commit `f96b830d`（PR #982 merge後）
- 検証基準: PR #977の全品質Gateと、PR #978〜#982の各CI
- 監査方法: 仕様・報告書・直近commit・ソース・品質Gateの読み取り検証

## 1. 調査した内容

- `AGENTS.md`と正本 `docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`
- `docs/IMPLEMENTATION_ROADMAP.md`、`docs/DECISION_LOG.md`
- Phase 1〜7の実装・完了・Production Gate文書
- `docs/REMAINING_FEATURE_IMPLEMENTATION_PLAN.md`
- `docs/ai-training/AI_TRAINING_CURRENT_STATE_AUDIT.md`
- `docs/ai-training/AI_TRAINING_PHASE1_IMPLEMENTATION_REPORT.md`
- monorepo構成、package依存境界、Prisma migration、Next.js route
- 最新mainのformat、typecheck、lint、unit test、production build
- 空PostgreSQL 16への全migration適用、schema readiness、integration test
- dependency auditとHigh / Critical脆弱性の修正
- 元checkoutに残っている長期停止中rebaseの状態

## 2. 現在の実装判定

### Platform / Architecture

- Phase 1 Platform Foundationは完了している。
- Multi-Bunshin Core、Knowledge Grant、Bunshin Memory、Capability Assignmentは実装済み。
- `1 User : N Bunshin`、Workspace / User / Bunshin / Serviceのスコープ分離を維持している。
- Application、Database Adapter、Capability、Provider、Web composition rootの依存境界があり、AST検査が `pnpm lint`と `pnpm test`に組み込まれている。
- Prisma migrationは213件あり、直近はSNS継続支援、OEM支援通知、AI研修個別化が追加されている。

### Product capabilities

コードは初期のPhase 2開始前ではなく、少なくとも次を含む段階まで進んでいる。

- SOCIAL戦略、週間計画、Daily Mission、採否、コピー、投稿完了、Feedback
- LINE認証、通知、再試行、リッチメニュー、Service単位の一斉配信と運用監視
- 画像・動画の制限付き生成・配布・運用機能
- Point、Badge、Reward、Service Credit、限定Pilotの運用基盤
- Multi-Service / Organization / Program Runtime / Service Role
- Fortune、AI Resale、AI TrainingのCapability package
- OEM契約・請求・決済・支援候補の運用基盤
- 退会、個人データ削除、法務同意、Production Gate証跡

### 直近の作業線

最新mainは「ワタシワークス AI研修」の個別化コアループに加え、Barrier対応から評価運用可視化までを実装済み。

- `TrainingParticipantProfile.workContext`
- 固定されたMission objective / criteriaを守る定型Personalization
- PASS後の実務利用結果記録
- 利用結果の次回Policyへの反映
- Barrier理由に応じた決定的な分岐と1分版Assignment Variant
- Practice / Work表示と通常版への復元
- 回答評価の非同期Job、最大3回の再試行、失敗後の本人再投入
- 管理画面の匿名集計と評価Jobの運用指標

Barrier reason、1分版、Practice / Work表示、非同期評価と運用指標はPR #980〜#982で完了した。次のコード候補はProviderによるScenario個別化、回答・評価・ToolkitのPrivacy lifecycle、運用通知である。ただし、いずれもPilot実測値または保持・閲覧方針の人間判断が必要であり、先行実装しない。自動Template検出も反復データが蓄積するまで実装しない。

## 3. 変更したファイル

- `docs/CURRENT_IMPLEMENTATION_HANDOFF_2026-09-28.md`（本文書）
- `README.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DATABASE_OPERATION.md`
- `docs/FREE_MVP_PRODUCTION_GATE.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/PRODUCTION_ENVIRONMENT_PLAN.md`
- `docs/PRODUCTION_GATE_REVALIDATION_2026-09-28.md`
- `apps/web/package.json`
- `package.json`
- `pnpm-lock.yaml`
- `packages/database/test/database.integration.test.ts`

schema、migration、運用Secret、本番環境は変更していない。

## 4. 主要な設計判断

1. 最新 `origin/main`を現行実装の基準とする。
2. 旧 `bunshin-blog`系の211commitをplatformへ載せようとした停止中rebaseは、継続しない。現行platformの658commitを上書きする巨大な競合解消になり、既存のBLOG再利用方針としても粒度が大きすぎる。
3. 停止中rebaseは元checkoutにそのまま保存し、最新mainから独立worktree / branchを作って引き継ぐ。
4. 最新mainの `AGENTS.md` にある不変の制約を暗黙に弱めない。v1.0仕様と現行実装の差分は、Decision Logと最新機能文書を併用する現行ルールに従い、Governance課題として扱う。
5. Production実運用の完了と、コード実装の完了を分けて判定する。
6. Integration testは同じDBへ繰り返し実行できることをGateの一部とし、Bunshinより先にGroupを削除していたfixtureの依存順を修正する。

## 5. 実行した検証

Node.js `v24.19.0`、pnpm `10.10.0`を使用した。

| Command                             | Result                                        |
| ----------------------------------- | --------------------------------------------- |
| `pnpm install --frozen-lockfile`    | PASS                                          |
| `pnpm format:check`                 | PASS                                          |
| `pnpm typecheck`                    | PASS（25 / 25 tasks）                         |
| `pnpm lint`                         | PASS（25 / 25 tasks、architecture check含む） |
| `pnpm test`                         | PASS（25 / 25 tasks）                         |
| `pnpm build`                        | PASS（13 / 13 tasks）                         |
| `pnpm db:migrate:deploy`            | PASS（空PostgreSQL 16、213 migrations）       |
| `pnpm db:assert-ready`              | PASS                                          |
| `pnpm test:integration`             | PASS（42 tests / 1 file、同一DBで連続2回）    |
| `pnpm audit --audit-level moderate` | PASS（既知の脆弱性0件）                       |

主なテスト結果:

- Architecture boundary: 10 passed
- Web: 1,480 passed / 349 files
- Database unit/schema/isolation: 504 passed / 155 files
- Social Capability: 144 passed / 21 files
- Training Capability: 32 passed / 9 files
- Auth: 13 passed / 2 files

初回監査後の追加検証で、PostgreSQL実体を使う `pnpm test:integration` まで実行した。Production DB、LINE、AI Provider、Stripe等の外部サービスへの実接続は本監査の対象外。

dependency auditでNext.js 16.3.1のCritical 2件、ESLint経由の`js-yaml` 4.3.1のHigh 1件、`fflate`とVitestのModerate 3件を確認した。Next.js 16.3.3、`js-yaml` 4.3.2、`fflate` 0.7.5、Vitest 4.1.11へ更新し、更新後のauditは既知の脆弱性0件になった。

## 6. 未解決事項

### Documentation governance

- 最新mainの `AGENTS.md` は、古いPhase文書を履歴とし、Roadmap、Decision Log、最新機能文書を現行状態の判断材料にする内容へ更新済み。
- `README.md` は現行の主要Capability、Production Gateとの区別、v1.0仕様と後続文書の参照関係へ同期済み。
- 正本はv1.0の初期MVP仕様のままだが、実装は後続の判断ログと個別報告書を根拠に大幅に拡張されている。
- 現在状態の判断では、v1.0仕様を不変のArchitecture境界として維持しつつ、Roadmap、Decision Log、最新の機能別報告書を併用する。

### Production / operation

- 最新mainを含むVercel Production Deployment、live / readiness、Production Health Smokeの成功は再確認済み。
- Production migrationは、廃止済みのGitHub Actions手動workflowではなく、Vercel Production build先頭で適用する現行方式へ文書を同期した。
- backup / restore rehearsal、実端末smoke、LINE Go / No-Go、外部Provider、人間による受け入れの最新証跡は完了確認できない。
- `production` branchはGitHub branch protectionでPR経由、strictな`verify` / `database`、会話解決、管理者適用、force push / branch削除禁止を設定済み。共同編集者が1名のため承認数は0件で、第二レビュアー追加時に再評価する。
- Production Gateは、自社管理アカウントだけで未完了項目を運用中に検証する`CONDITIONAL GO`へ変更した。一般公開、外部顧客向け販売、無人運用は引き続き未承認。
- `docs/REMAINING_FEATURE_IMPLEMENTATION_PLAN.md` のR0は、主に本番Migration後の実アカウント・実端末確認待ち。
- 有料販売、SNS OAuth / 自動投稿は、R0と継続率検証が完了するまで先行しない。

### AI Training Phase 2 decisions

- 回答本文と実務Contextの保持期間
- 企業管理者・Support担当者の閲覧範囲と監査
- 未実施判定日数とReminder頻度
- Providerへ送る仕事Contextの最小範囲、Mask、送信前確認
- 評価運用アラートの閾値と通知先責任者
- ToolkitのExport・削除と契約終了時の扱い
- 同種業務の反復データが何件あればTemplate提案を開始するか

## 7. 次へ進める条件

1. コード追加より先に、R0 Production Gateの実施状況と本番証跡を確認する。
2. AI研修の次実装を行う場合は、自社Pilotで成功率、再試行率、完了時間、Barrier、1分版、実務利用率を観測する。
3. DB変更を含む作業では、migration、既存データ後方互換、Workspace / Service / Enrollment / User分離testを必須とする。
4. 外部Providerを用いる作業では、model、Prompt Version、usage、cost、latency、resultの記録とFallbackを必須とする。
5. Privacy lifecycleを実装する前に、保持期間、本人削除・Export、契約終了、管理者・Support閲覧範囲を決定する。

## 8. 推奨する次の作業順

1. Production Gate / R0の現地証跡回収
2. 千ノ国メディアを含む専用LINEの対象者別接続・同意・友だち状態と実受信の確認
3. AI研修の自社Pilotで個別化品質、Barrier、1分版、実務利用率、評価Job指標を観測
4. 保持・削除・Export・閲覧範囲を決め、Privacy lifecycleを独立PRで実装
5. Pilot結果後にProvider個別化、運用通知、Template提案を別々に再判定
