# ハッシー ロードマップ達成条件管理 実装報告

## 1. 調査

基準main: `0775e1b2`（PR #1438）。`AGENTS.md`、仕様正本、Architecture Principles、Implementation Roadmap、Decision Log、既存SNS提案設定のADR・実装報告、Hassy Product Policy、共通Member Roadmap、公開入口、関連テストを確認した。

| 既存資産                                      | 再利用と変更                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Application `member-roadmap.ts`               | 進捗計算をそのまま利用。ハッシーの段階や設定を追加しない                                      |
| Web `hassy-growth-policy.ts`                  | 固定5段階・FACT条件・定義検証を利用                                                           |
| Web `service-growth-policy.ts`                | 明示的HASSY選択・scope固定を維持し、保存条件を取り込む                                        |
| `GroupFeaturePolicy` / `GroupFeatureAuditLog` | 既存の保護されたconfig、監査、Groupロックを利用                                               |
| SNS提案設定                                   | 保存トランザクション・HTTP境界・フォームの再送制御だけを抽出。SNS条件・外部操作には変更しない |
| 利用実績・紹介実績                            | 既存Read Modelを利用。活動・紹介イベントや特典を重複保存しない                                |

## 2. 変更したファイル

- `apps/web/src/services/hassy-roadmap-settings.ts`: Product固有の条件、保存形式検証、実効条件、定義生成。
- `apps/web/src/services/hassy-roadmap-policy-store.ts`: Productのcompositionと既存DB基盤の接続。
- `apps/web/src/services/service-growth-policy.ts` / `src/http/service-member-roadmap.ts`: 会員向けの実際の進捗へ接続。
- `packages/database/src/managed-feature-policy.ts`: 既存SNS保存処理を共通化。SNS adapterからも利用。
- `apps/web/src/http/managed-feature-policy.ts` / `hassy-roadmap-policy.ts`: 既存HTTP境界の再利用。
- `/s/[serviceSlug]/manage/roadmap`、`/api/services/[serviceSlug]/roadmap-policy`: 本部/OEM管理画面・API。
- `app/ui/use-managed-policy-editor.ts`: 既存SNSフォームとロードマップの取得・revision確認・再送receiptを共通化。
- 管理メニュー、本部機能設定ページ、認証戻り先、関連テスト、ブラウザ検証harness。

共有ファイルの変更: database `src/index.ts`に公開exportを追加。ブラウザ検証の入口・設定にケースを追加。schema、migration、Cron、環境変数、Feature Flagは追加・変更していない。

## 3. 主要な設計判断

[ADR](adr/HASSY_ROADMAP_POLICY_ADMIN_ADR.md)参照。

編集対象は投稿案生成回数1–1000、採用/不採用回数1–1000、累計実活動日数1–365、任意の紹介目標0–1000（0は非表示）。未設定は従来の1回・1回・3日・紹介目標なし。段階追加・並び替え・名称・FACT条件は変更しない。

本部条件は各サービスを対象にSUPER_ADMINが設定する。OEMは同じworkspace/serviceのACTIVEなSERVICE_OWNER/ADMINのみ。本部設定後に利用実績目標を基準以上へ変更できる。紹介目標は本部で許可された場合のみ、本部以上または非表示へ変更できる。後から本部基準が上がった場合は実効値へ反映する。全サービス共通の標準設定配布UIではない。

設定は`SOCIAL.ACTIVITY_SUPPORT`の`config._managedPolicies.hassyRoadmapPolicy`へ保存する。SNS提案設定とrevision・要求receiptを分離し、同じGroupロックと予約namespace保護で競合を防ぐ。既存のSNS設定の保存形式、auditの`recommendationPolicy`キー、認可、冪等性を維持する。欠落行を作る場合はDISABLEDを維持し、自動的に機能権限を付与しない。

進捗表示は最新条件で再計算する。definitionVersionは`hassy-roadmap-managed-v1-r{revision}`。紹介目標はSTEP 5だけの任意項目であり、基本SNS機能の利用、他項目、特典・Entitlementの付与を制限しない。紹介証拠が不明なら進捗も不明とする。既存活動、紹介成果、確定特典、開始済み支援は書き換えない。

APIは認証、同一origin、strict入力、server側scope確定、private/no-store、既存per-user Rate Limitを使う。DBで現在のactor/tenant/templateを再確認し、revision競合は409。同一body再送は追加保存・監査を作らない。管理画面に秘密・他設定・被紹介者情報を返さない。不正な保存設定は既定値へ黙って戻さず、会員APIで503として扱う。

## 4. 検証

- 関連Webテスト253件成功（条件の範囲、旧データ、実際のAPI進捗への反映、スコープ、認証、同一origin、rate guard、認証戻り先）。
- 依存境界検査成功。使い捨てPostgreSQL 16へ既存migrationをすべて適用済み。
- PostgreSQL関連28件成功。同一行の別namespace同時保存、template変更後のread/write/replay拒否、他tenant/actor拒否、既存SNSの冪等性・認可・判定を検証した。初回の全体360件中359件成功で見つけた新規fixtureのrevokedAt不足は、既存DB制約に合わせて修正し関連ケースを再実行した。
- スマートフォン390pxで新規3件、既存SNS設定3件成功。保存・revision競合・明示refresh・権限取消・本部初回設定を確認し、スクリーンショットを目視した。
- 全packageの型検査25タスク成功後、ブラウザテストのJSON応答の型を修正してUI型検査も成功した。
- 標準CIの最終HEADに対するformat/typecheck/lint/test/UI/build/databaseの結果はPR本文へ記録する。

## 5. 未解決事項と運用状況

実装済みと本番反映済みは別。今回は本番DB・設定・Feature Flag・デプロイ・外部AIを操作していない。条件の変更による表示上の進捗再計算はあるが、過去の達成版を個別のイベントとして新規保存しない。

段階の追加・名称編集、紹介3/5/10件の機能体験・特典カタログ、未回答提案の表示間隔、画像多用/複数SNS等の提案拡張、MUSE接続PoC、100社の本番Pilotは引き続き別作業。

## 6. 次へ進める条件

最新mainとの整合、標準CI verify/database、既存SNS設定の回帰、共通設定保存の同時更新、スマホ操作を通過してレビュー・マージする。本番公開は別のreadiness/デプロイ確認とする。次の実装候補は追加の提案ルールと未回答提案の抑制設定を、既存Scheduler/Barrierに接続すること。
