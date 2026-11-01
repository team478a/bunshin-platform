# 成長ロードマップ Phase 1-B2 読み取りAdapter実装報告

作成日: 2026-11-02

基点: origin/main `8236c3793ec38cad01c51a4cb7180977675cd218`（PR #1422マージ後）

ブランチ: `codex/hassy-roadmap-context`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、ロードマップ判定と利用実績の最新ADR / 実装報告、packageの公開入口・関連テストを確認した。OnboardingResponse、SocialProfile、WeeklyPlan、MissionActivity、SocialInsightSnapshot、Capability、既存entitlement Resolverと採否の実行経路を調査した。

既存紹介状態はREGISTERED等で、有効紹介の独立した確定数を直接表していない。ガイド閲覧・予約投稿・実際の改善反映を示す専用証拠もない。これらを他のイベントや特典数から推測しない方針とした。

## 2. 変更したファイル

- `packages/database/src/member-roadmap-context.ts`: 本人のContext取得Adapter
- `packages/database/src/member-usage-authorization.ts`: 利用実績とContextで共用する内部の認可・request snapshot helper
- `packages/database/src/member-usage-repository.ts`: 既存認可を同helperへ移動。集計Sourceの投影規則は変更なし
- `packages/database/src/group-feature-entitlement.ts`: 同一transaction内で使う読み取り専用Resolver入口、Policy / Assignmentの明示scopeと必要列の選択
- `packages/database/src/index.ts`: exportの追加のみ（共有ファイルの変更）
- `packages/database/test/member-roadmap-context.test.ts`: 新規unit 21件
- `packages/database/test/member-roadmap-context.integration-cases.ts`: 新規SQL統合14件
- `packages/database/test/database.integration.test.ts`: disposable DB preflight内でのcase登録追加のみ（共有ファイルの変更）
- `docs/adr/HASSY_ROADMAP_CONTEXT_ADR.md`: 実装前の判断
- 本報告書

schema/migration、API / UI、依存、環境変数、Feature Definition / Flag、特典・Creditには変更がない。

## 3. 主要な設計判断

[ADR](adr/HASSY_ROADMAP_CONTEXT_ADR.md)を参照。

### 認可と時点

現在のACTIVEなUser / Workspace / Membership / Service、参加同意・最新有効規約、Bunshin所有権を再検証する。Platform Adminのoverrideはない。過去のasOfでも現在の失効を迂回できない。

認可とContext取得は同一のRepeatable Read / read-only transaction。既存の認可条件を共通helperへ移し、Context用に複製しない。達成証拠はasOf以前、機能権限・Capability・Bunshin稼働状態は現在時点で確認する。

### 証拠の対応

| ロードマップ項目 | 使う既存正本                                                            | 判定                                                    |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| 初期設定         | 本人のServiceOnboardingResponse完了と対象Bunshinの保存済みSocialProfile | 両方確認できた場合のみtrue                              |
| 週間計画         | confirmedAtを持つCONFIRMED / EXPIREDのWeeklyPlan                        | 期限切れでも過去の確認実績を保持                        |
| 投稿準備         | 本人のCOPIED_TEXT等のMissionActivity                                    | 投稿準備支援の実利用。SNS公開の証明にはしない           |
| SNS実績          | 本人が保存したMANUAL / SCREENSHOTのSocialInsightSnapshot                | 記録の存在だけ。公式API接続や個別数値の真偽を証明しない |

証拠がない場合はnull。POST_HISTORY等の別の閲覧や分析・改善反映へ読み替えない。validReferralsもnullを維持する。質問・回答、投稿本文、Memory、個別SNS数値、policy configは選択しない。

### 利用可否と次の候補

既存SOCIAL entitlement Resolverを同じtransactionで呼び、Workspace / Group / 本人のAssignmentに絞る。SOCIAL CapabilityのACTIVE / activatedAtとBunshinの現在のACTIVE状態も照合する。明示的なPolicy / Assignmentがない場合、許可を推測しない。

現版は、AIを呼ばないFIRST_DECISION / POST_HISTORY / SNS_METRICSだけにfeature stateを接続する。採否の前提は、本人のBunshinに現在利用中・保存済みcontent・PENDINGな判断行を持つMissionがあること。これは完了Claimがない旧Missionでも確認できる。数値記録の前提は現在ACTIVEな対象プロフィール。

これらの導線のAI原価は0として扱い、AI生成等の予算が未確認の機能はfeaturesへ追加しない。実際の採否・入力は、本人が操作した時にも既存のUse Caseで再認可する。読み取りでは利用回数や権限を消費しない。ロードマップを既存基本APIの新たな実行gateにはしない。

## 4. 実行した検証

Node 24.22.1、pnpm 10.10.0、PostgreSQL 16。

- Database unit: 44件成功（新規21件 + 既存利用実績23件）
- Application関連: 73件成功（ロードマップ50件 + 集計23件）
- SQL統合: 35件成功（新規14件 + 既存利用実績21件）
- Database全体TypeScript、変更TS lint / format、依存境界、git diff --check: 成功

SQLは `bunshin_disposable_c0ab6c1ca801e561` を127.0.0.1:18998へ限定して使用した。Container ID / task・run label、DB名とcomment markerを照合し、既存preflight内で合成データを使った。既存267 migrationをそのDBだけに適用した。Containerと一時volumeは終了・削除済みで、本番DBには接続していない。

他OEM・他Bunshin・同じUserの複数サービス・グローバル管理者、現在の失効と同意、将来の証拠、過去の達成保持、既存Coreとの合成、read-onlyによる非更新を検証した。lintのテスト内の不要なasyncは取り除き、設定の緩和は行っていない。

全体format / typecheck / lint / test / learning UI / buildと、全DB統合・readiness・native release・TLSはPRのCI verify / databaseを最終ゲートとする。最終コミットと結果はPR本文へ記録する。

## 5. 未解決事項

- ロードマップHTTP/API・UIは未接続。既定定義factoryのみで、定義保存・管理・監査は後続。
- 有効紹介の資格判定、外部ガイド閲覧・接続、予約投稿・分析実行・改善反映の証拠は未接続。
- 生成等のAI原価予算と、他の操作の安全な実行前提は未照合。未解決の機能を推奨可能へ補完しない。
- SOCIALのPolicy / Assignmentが不足する既存会員では、Resolverの拒否を返す。今回それらの設定を自動付与・変更していない。
- 本番反映、Feature有効化、外部AI / SNS操作は未実施。

## 6. 次へ進める条件

- 本PRのレビュー、CI verify / databaseの成功、マージ。
- 次は既存の会員Scope / timezone解決・Rate Limitに接続して、ロードマップAPIを用意する。内部ID・権限記録をそのまま公開しない。
- 生成等を優先候補へ含める前に、既存予算基盤と実行前提を読み取りで照合する。実行時の承認・再検証を代替しない。
