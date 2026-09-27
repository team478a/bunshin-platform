# 現行実装状況・引継ぎ監査

- 監査日: 2026-09-28（Asia/Tokyo）
- 対象: `origin/main` commit `ec30c9a5036475a7d4e69d06a7fb62ed8efda29d`
- 対象PR: #975 merge後
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

最新mainは「ワタシワークス AI研修」のPhase 1個別化を実装済み。

- `TrainingParticipantProfile.workContext`
- 固定されたMission objective / criteriaを守る定型Personalization
- PASS後の実務利用結果記録
- 利用結果の次回Policyへの反映
- 管理画面の匿名集計

次の候補はBarrier reasonと1分版Missionだが、理由taxonomy、未実施判定日数、Reminder頻度、1分版を本人選択と自動提案のどちらにするかが未決定のため、本監査では実装を開始しない。

## 3. 変更したファイル

- `docs/CURRENT_IMPLEMENTATION_HANDOFF_2026-09-28.md`（本文書）

ソースコード、schema、migration、運用設定は変更していない。

## 4. 主要な設計判断

1. 最新 `origin/main`を現行実装の基準とする。
2. 旧 `bunshin-blog`系の211commitをplatformへ載せようとした停止中rebaseは、継続しない。現行platformの658commitを上書きする巨大な競合解消になり、既存のBLOG再利用方針としても粒度が大きすぎる。
3. 停止中rebaseは元checkoutにそのまま保存し、最新mainから独立worktree / branchを作って引き継ぐ。
4. 最新mainの `AGENTS.md` にある不変の制約を暗黙に弱めない。v1.0仕様と現行実装の差分は、Decision Logと最新機能文書を併用する現行ルールに従い、Governance課題として扱う。
5. Production実運用の完了と、コード実装の完了を分けて判定する。

## 5. 実行した検証

Node.js `v24.19.0`、pnpm `10.10.0`を使用した。

| Command                          | Result                                        |
| -------------------------------- | --------------------------------------------- |
| `pnpm install --frozen-lockfile` | PASS                                          |
| `pnpm format:check`              | PASS                                          |
| `pnpm typecheck`                 | PASS（25 / 25 tasks）                         |
| `pnpm lint`                      | PASS（25 / 25 tasks、architecture check含む） |
| `pnpm test`                      | PASS（25 / 25 tasks）                         |
| `pnpm build`                     | PASS（13 / 13 tasks）                         |

主なテスト結果:

- Architecture boundary: 10 passed
- Web: 1,480 passed / 349 files
- Database unit/schema/isolation: 504 passed / 155 files
- Social Capability: 144 passed / 21 files
- Training Capability: 32 passed / 9 files
- Auth: 13 passed / 2 files

`pnpm test` は通常テストであり、PostgreSQL実体を使う `pnpm test:integration`は実行していない。Production DB、LINE、AI Provider、Stripe等の外部サービスへの実接続も本監査の対象外。

## 6. 未解決事項

### Documentation governance

- 最新mainの `AGENTS.md` は、古いPhase文書を履歴とし、Roadmap、Decision Log、最新機能文書を現行状態の判断材料にする内容へ更新済み。
- `README.md` は現在もPhase 0〜5完了時点の説明で、LINE、画像・動画、Job、課金が未実装と記載されており、現行mainと矛盾する。
- 正本はv1.0の初期MVP仕様のままだが、実装は後続の判断ログと個別報告書を根拠に大幅に拡張されている。
- 次回の文書作業では、READMEを現行状態へ同期し、v1.0仕様と後続の承認済み決定の関係を読者に明示する必要がある。

### Production / operation

- Production migration status、backup / restore rehearsal、実端术smoke、LINE Go / No-Goの証跡はコードからは完了確認できない。
- `docs/REMAINING_FEATURE_IMPLEMENTATION_PLAN.md` のR0は、主に本番Migration後の実アカウント・実端末確認待ち。
- 有料販売、SNS OAuth / 自動投稿は、R0と継続率検証が完了するまで先行しない。

### AI Training Phase 2 decisions

- 回答本文と実務Contextの保持期間
- 企業管理者・Support担当者の閲覧範囲と監査
- 未実施理由の正式taxonomyと分岐
- 未実施判定日数とReminder頻度
- 1分版Missionを本人選択にするか自動提案にするか
- PracticeからWork modeへの移行条件

## 7. 次へ進める条件

1. READMEの現行状態への同期と、v1.0仕様から後続のDecision Logへの参照関係を明示する。
2. コード追加より先に、R0 Production Gateの実施状況と本番証跡を確認する。
3. AI研修の次実装を行う場合は、上記のBarrier / SHORT variantに関する事業判断を先に決定する。
4. DB変更を含む作業では、migration、既存データ後方互換、Workspace / Service / Enrollment / User分離testを必須とする。
5. 外部Providerを用いる作業では、model、Prompt Version、usage、cost、latency、resultの記録とFallbackを必須とする。

## 8. 推奨する次の作業順

1. Production Gate / R0の現地証跡回収
2. READMEと仕様・現行状態の参照関係を整理する文書PR
3. AI研修Phase 1の非本番Pilotと品質・利用率計測
4. 判断済み仕様に基づくBarrier reason / SHORT variantの小さな縦切り
5. Pilot結果後に、Provider個別化、評価Job化、Practice / Work modeを別々に再判定
