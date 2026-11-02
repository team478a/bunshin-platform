# B1 ハッシー成長Policy分離 実装報告

作成日: 2026-11-02
基点: origin/main `9860e0ba`（#1427マージ後）
ブランチ: `codex/hassy-growth-policy-boundary`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Decision Log、実装Roadmap、[責務分離設計](HASSY_SHARED_CAPABILITY_BOUNDARY_DESIGN.md)とADR、既存のService作成 / 設定更新 / Hassy seed、公開exports、実装・テストを確認した。

サービス作成の `apps/web/src/http/service-create.ts` とHassy seed `20261025120000_seed_hassy_public_service` は、既存の `registration.onboardingConfig.templateKey = HASSY` を保存する。設定更新は元のonboardingConfigを保持して更新する。これを既存の明示的なテンプレート選択として使い、slug・表示名・businessProfileEnabledからの推測は行わない。

CommercialServiceProduct / OEM提供契約は商用の提供・課金境界として維持する。今回のロードマップ定義の選択はテンプレート設定を使い、現在の機能利用可否は既存Entitlement Resolverで確認する。

## 2. 変更したファイル

| 領域         | ファイル / 変更                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| サービス固有 | `apps/web/src/services/hassy-growth-policy.ts`: 固定5段階・項目・初期閾値・Hassy版の検証をApplicationから移設                                                                                            |
| 適用先       | `apps/web/src/services/service-growth-policy.ts`: 認可済みServiceContextの設定を読み、Workspace / ServiceへPolicyを束縛                                                                                  |
| 共通評価     | `packages/application/src/member-roadmap.ts`: 既定Hassy定義を削除。Policyを必須注入し、定義の構造・scope・重複・条件と証拠キーを共通検証                                                                 |
| 証拠取得     | `packages/database/src/member-roadmap-context.ts`: 定義を返さずSNS証拠・利用可否だけを返す                                                                                                               |
| API          | `apps/web/src/http/service-member-read.ts`: 解決済みServiceを内部callbackへ渡す。`service-member-roadmap.ts`: Policyを選択してUse Caseへ注入                                                             |
| 表示         | `apps/web/app/ui/member-growth-roadmap/policy-gate.tsx`: サービス適用先の表示分岐。`card.tsx`: Hassy向けcomponent名を明示。`data.ts`: 項目IDを固有catalogから再利用                                      |
| ホーム       | `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx`: 既存の本人 / SOCIAL条件にPolicy表示分岐を重ねる                                                                     |
| 共通テスト   | `packages/application/test/member-roadmap.test.ts`: 固定商品名や5段階に依存しない13件                                                                                                                    |
| Hassyテスト  | `apps/web/test/hassy-growth-roadmap.test.ts`: 既存50件を移設。`service-growth-policy.test.ts`: 選択・scope・旧設定等。`hassy-growth-policy-ui.test.tsx`: 実表示分岐6件                                   |
| API回帰      | `apps/web/test/service-member-roadmap.test.ts`: 他テンプレートの拒否と通常usageの維持、DBからの定義注入を無視する検証                                                                                    |
| DB回帰       | `packages/database/test/member-roadmap-context.test.ts` / `member-roadmap-context.integration-cases.ts` / `member-roadmap-policy-fixture.ts`: DBから定義が出ないこと、明示された中立テストPolicyとの合成 |
| 設計         | `docs/adr/HASSY_GROWTH_POLICY_SELECTION_ADR.md` と本報告書                                                                                                                                               |

### 共有ファイルの変更

- `scripts/test/learning-ui/growth-harness.tsx`: 実componentの名前変更に追従。他のfixtureやテスト登録は変更していない。
- packageの公開index、schema、Decision Log、Roadmap、crons・環境変数には変更がない。既存のstar exportから公開されていたHassy専用factory / 定数はWebへ移し、リポジトリ内の利用箇所をすべて更新した。private package間の内部契約変更であり、HTTP v1の変更とは区別する。

## 3. 主要な設計判断

[実装ADR](adr/HASSY_GROWTH_POLICY_SELECTION_ADR.md)を参照。

### 固有定義・共通評価・証拠を分ける

Applicationからhassy-roadmap-v1、STEP_1〜5の固定列挙、SNS / MUSE / Zapierの項目定義を外した。共通部分はscope / 完全性 / UNKNOWN / 現在の利用可否 / 順序付けを評価し、固定段階数を必須にしない。構造は1〜20段階・全200項目以内などの上限を設け、未宣言のfact / featureや不正な条件を拒否する。

Hassy固有の必須15項目、配置、metric対応、固定版の不変性、基本項目を紹介条件にしない検証は固有Policyへ移し、維持した。資格や機能の解放処理を表示判定へ追加していない。

Databaseは `MemberRoadmapEvidenceContext` を返し、factoryを呼ばない。GetMemberRoadmapは明示的Policyを必須とし、選択された定義をawait前にコピー・検証する。Adapterの返却値にdefinitionが混ざっても採用しない。ApplicationからSOCIAL / Webへの逆importは追加していない。

### Serviceに束縛する

ServiceContextとConfigurationのWorkspace / Groupが一致し、保存済みtemplateKeyが自身のプロパティとして正確にHASSYである場合だけ選択する。OEMでslugや表示名が異なっても、同じ明示テンプレートなら使える。選択後のPolicyはそのWorkspace / Serviceに束縛し、呼出し側のcontextオブジェクトが後から変わっても別scopeへ切り替わらない。

CUSTOM / MANABERU_STYLE / 未設定 / 不正設定 / scope不一致にはHassyをfallbackしない。ロードマップAPIは404、ホームのロードマップ欄は非表示になる。通常のmember-usage API・今日やること・基本SNS APIは新たに制限しない。

既存のHassy v1 DTOのキー、名称、5段階、候補選択、採用等の意味を維持する。定義の内部scopeをServiceへ束縛しても公開DTOには出さない。認可・法的同意・所有権・停止・Entitlement / 予算の既存照合は残る。

## 4. 実行した検証

Node 24.22.1 / pnpm 10.10.0、PostgreSQL 16、スマホUI 390×844。

- Application全体: 149ファイル1,131件成功。既存Hassy専用50件をWebへ移し、新しい共通評価13件を追加したため件数が変わる
- 関連Web: 8ファイル264件成功。Hassy 50件、選択・scope、表示分岐、HTTP / 認証導線 / 通常usage回帰を含む
- Database unit: 44件成功（Context 21件 + Usage 23件）
- SQL統合: 35件成功（Context 14件 + Usage 21件）。他の268件は対象選択でskipし、CIでは全303件を検証する
- 既存スマホUI全体: 10ファイル50件成功
- Application / Database / Web / UI harness TypeScript、変更TS lint、依存境界、git diff --check: 成功
- Prisma Client生成: 成功。DBに新しいmigrationはない

SQLは合成データだけを使い、ローカル127.0.0.1:18998のdisposable containerへ既存267 migrationを適用した。Containerの正確なID・task/run label・bind mountなし・DB名・comment markerを確認し、既存preflightを通した。DB `bunshin_disposable_91b46b29376d4353` とcontainer / 一時volumeは検証後に削除した。本番DBには接続していない。

移設時にテストfixtureへ未宣言の任意項目の権限が残っていたため、使用する定義に対応したfixtureへ修正した。型専用importと不要なassertionも修正し、lintやテストの設定は緩めていない。50件のHassy固有検証を削除して共通テストへ置き換えたものではない。

全体format / typecheck / lint / test / UI / build、DB全統合 / readiness / native release / TLSは最終コミットのCI verify / databaseを品質ゲートとする。最終の結果とコミットをPR本文へ記録する。

## 5. 未解決事項

- templateKeyが保存されていない旧Serviceはロードマップ未提供となる。名前やslugによる救済・設定の自動付与は行っていない。本番の保存状況・適用確認は未実施
- テンプレートからHassy v1への対応は固定で、OEM別の成長条件編集や新しいprofile管理画面は未実装
- member-usageのSNS正本投影、資格CoreのSNS条件binding、既存習慣日と実操作日の処理整理は残る。今回すべての指標を全サービス汎用化したとは扱わない
- UIからのロードマップ / 利用実績の2要求と二重集計はB2の対象として残す
- 紹介の確定保存・特典付与・新しい機能開放や外部AI連携は未接続
- 本番反映・設定・Feature Flag・Credit・契約・外部操作は変更していない

## 6. 次へ進める条件

- 本PRのレビュー、最終コミットのCI verify / database成功、マージ
- 次のB2では、異なる意味の習慣日 / 実操作日を維持しつつ、同じUI閲覧での利用集計を1回へまとめる。既存v1 APIとscope / Rate Limit / no-store / 失効再検証を保つ
- B3の紹介保存へ進む前に、資格条件のSNS証拠bindingと共通判定の境界、既存台帳の非遡及・一意性を確定する
