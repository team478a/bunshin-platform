# 成長ロードマップ Phase 1-B3 会員API実装報告

作成日: 2026-11-02

基点: origin/main `e2507da77cb77c4eab3581cfcae0f236c249026e`（PR #1423マージ後）

ブランチ: `codex/hassy-roadmap-api`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、利用実績API・ロードマップCore・Context Adapterの最新ADR / 実装報告、関連テスト、package公開入口を確認した。既存のverified session、会員Service解決、所属・所有権確認、通知timezone、エラー応答とプロセス内負荷制限を調査した。

## 2. 変更したファイル

- `apps/web/app/api/services/[serviceSlug]/bunshins/[bunshinId]/member-roadmap/route.ts`: Node / force-dynamicのGET入口
- `apps/web/src/http/service-member-roadmap.ts`: 既存Use Case / Adapterの組み立てと公開DTO
- `apps/web/src/http/service-member-read.ts`: 既存APIから抽出した認証・scope / timezone解決・負荷制限・エラー処理
- `apps/web/src/http/service-member-usage.ts`: 同helperを利用。既存公開DTOは維持
- `apps/web/test/service-member-roadmap.test.ts`: 新規39件。実Application評価器を通すHTTP結合テスト
- `docs/adr/HASSY_ROADMAP_API_ADR.md`: 実装前の判断
- 本報告書

共有ファイルの変更はない。Database / Application実装、schema / migration、依存、環境変数、UI、本番設定は変更していない。

## 3. 主要な設計判断

[ADR](adr/HASSY_ROADMAP_API_ADR.md)を参照。

### API契約

GET `/api/services/[serviceSlug]/bunshins/[bunshinId]/member-roadmap`。

actorはverified session、Workspace / Serviceは会員向けslug解決、Membershipは同Workspace / Service / UserのACTIVE所属から決める。対象Bunshinは同Serviceの本人所有・未ARCHIVEDに限定する。Adapterは現在の所属・最新規約同意・所有権・機能権限を引き続き再検証し、管理者overrideはない。

query parameterはすべて拒否する。asOfはサーバー現在時刻、timezoneは対象Bunshinの本人の通知設定を使い、未保存だけAsia/Tokyo。不正保存値は503。

外側は `{ data, requestId }`。dataは以下を明示投影する。

| 項目              | 内容                                                   |
| ----------------- | ------------------------------------------------------ |
| version           | member-roadmap-api-v1                                  |
| definitionVersion | 適用したロードマップ定義版                             |
| asOf / timezone   | 同じ評価時刻と日付境界                                 |
| currentStageId    | 未完了の先頭段階。全完了ならnull                       |
| nextRecommended   | 優先するstageId / milestoneIdを最大1件。候補なしはnull |
| stages            | 段階ID・名称・表示状態・完了/全体/不明件数、各項目     |
| 各項目            | ID・名称・表示状態・理由・達成状態・利用可否・進捗     |

内部scope、原価、Source、投稿本文、Memory、権限設定、個別証拠、操作URLは返さない。UNKNOWNとnullを未達成や0件へ変換しない。達成済みの記録と現在の機能停止・権限状態を分けて返す。APIへのアクセスを活動日に加算しない。

### 認可・原価・負荷

利用実績APIと共通helper・同じRate Limit singletonを使う。verified user単位でService / Bunshin / 2つのAPIを跨いで1分10回・同時1件、最大1,000ユーザー。429にRetry-Afterを付け、障害でもfinallyで枠を解放する。これはプロセス内制限で、分散上限ではない。

成功・失敗ともprivate, no-store / Vary: Cookie, Authorization。未認証401、入力不正400、対象不在・失効・同意拒否404、部分Source・scope不整合・壊れたContext503。不明障害は既存の500マッピングで詳細を隠す。

利用実績とContextは同じasOfを共有するが、別々の読み取りtransactionである。跨いだ同一snapshotは保証しない。候補表示は実行権限を付与せず、実行時の既存Use Caseによる現在の再検証を置き換えない。

新たなAI API呼び出し・原価予約・特典付与・機能消費・外部操作・利用記録の保存は行わない。既存認証のアカウント解決動作は維持する。

## 4. 実行した検証

Node 24.22.1 / pnpm 10.10.0。

- HTTP / guard / 認証経路の関連テスト: 4ファイル175件成功（新規ロードマップHTTP39件を含む）
- Application関連: 2ファイル73件成功
- 新規HTTPテストは認証・DB Portを合成mockし、実GetMemberUsageSummary / GetMemberRoadmapを使用
- 実guardを注入し、2つのAPI間での回数・同時枠の共有と障害後の解放を確認
- 現在の権限拒否・停止・予算拒否・操作前提不足、UNKNOWN、旧データ、内部情報非公開、不整合Context / Source、timezoneと失効を確認
- Prisma Client生成、変更ファイルformat、依存境界、git diff --check: 成功
- Web全体TypeScript: 成功
- 変更TS lint: 成功

全体format / typecheck / lint / test / learning UI / build、DB統合 / readiness / native release / TLSは最終コミットのCI verify / databaseを品質ゲートにする。結果とコミットはPR本文へ記録する。

最初のHTTPテスト実行では、テスト作成時にguard mockの参照先を誤って置換したため失敗した。参照先を実際の既存guardへ修正し、全175件が成功した。製品の制限やタイムアウトを緩めていない。

## 5. 未解決事項

- 成長ロードマップ画面は未接続。既存の90日計画画面とは別機能。
- 既定定義のみ。有効紹介の資格判定・管理設定、提案履歴・回答・抑制・効果測定は後続。
- Context AdapterのAI予算・操作前提・証拠が未解決の機能は準備中のまま。SOCIAL Policy / Assignment不足を自動補完しない。
- 権限不足を基本SNS APIへの新たな紹介必須条件にはしない。実際のSNS投稿の公開確認や外部接続を推測しない。
- 分散Rate Limit・大量履歴のSource上限、本番での負荷確認は未対応。
- 本番反映・Feature Flag変更・外部AI / SNS操作は未実施。既存learning UI CIは今回のロードマップ画面の検証ではない。

## 6. 次へ進める条件

- 本PRのレビュー、最終コミットのCI verify / database成功、マージ。
- 次はスマートフォン向けロードマップ画面。今日の行動と次の候補1件を優先し、不明・準備中・達成済み・利用可能を区別する。
- 生成等を推奨候補へ追加する場合は、既存予算基盤と操作前提の読み取り照合を別PRで先に接続する。
