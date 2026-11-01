# ハッシー利用実績API Phase 1-A4 実装報告

作成日: 2026-11-02

基点: origin/main `e5d7de9922ff054188050fb86301facf12f3f3de`（PR #1420マージ後）

ブランチ: `codex/hassy-member-usage-api`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、既存の集計・DB読み取り・生成起動元のADRと実装報告を確認した。会員用Service解決、verified session、本人の所属とBunshin、通知timezone、既存のHTTPエラー・キャッシュ方針、関連テスト、各packageの公開入口を確認した。

共通のHTTP Rate Limitは現行コードに存在せず、既存のrate limit関連処理はProvider障害分類やAI呼び出しの費用・入力上限だった。JobやAI費用予約へ読み取り回数を重複保存することは避け、このAPI専用のプロセス内guardを追加した。

## 2. 変更したファイル

- `apps/web/app/api/services/[serviceSlug]/bunshins/[bunshinId]/member-usage/route.ts`: GETのcomposition root入口。Node runtimeとforce-dynamicを明示
- `apps/web/src/http/service-member-usage.ts`: 本人scope・timezone解決、既存Use Case / Adapterの接続、公開DTO、エラーマッピング
- `apps/web/src/http/member-usage-read-limit.ts`: verified user単位の回数・同時実行制限
- `apps/web/test/service-member-usage.test.ts`: 実Use CaseとHTTP経路の結合テスト（認証・DB Portは合成mock）
- `apps/web/test/member-usage-read-limit.test.ts`: guardの境界・容量・lease解放テスト
- `docs/adr/HASSY_MEMBER_USAGE_API_ADR.md`: 実装前の設計判断
- 本報告書

共有ファイルの変更、DB/schema/migration、依存・環境変数、既存UIの変更はない。

## 3. 主要な設計判断

[ADR](adr/HASSY_MEMBER_USAGE_API_ADR.md)を参照。

### API契約

`GET /api/services/{serviceSlug}/bunshins/{bunshinId}/member-usage`

Query parameterは受け付けない。actor、Workspace / Service / Membership / UserのID、asOf、timezoneはサーバーで解決する。パスで選択されたBunshin IDはUUID検証し、所属とBunshinは同Workspace / Service / 本人で絞る。GetMemberUsageSummaryと既存Adapterが、現在の所属・規約同意・所有権を再検証してからSourceを読む。

| 項目                   | 内容                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| version                | member-usage-api-v1                                                                                                 |
| asOf                   | サーバー側の取得日時（ISO）                                                                                         |
| timezone               | 本人の対象Bunshinの通知設定。未設定だけAsia/Tokyo。不正な保存値は503                                                |
| allTime                | 全期間のgenerated / unknownTriggerGenerations / accepted / rejected / selfReportedPosts / activeDays / lastActiveAt |
| last7Days / last30Days | 同じ指標とfromLocalDate / throughLocalDate。当日を含む暦日                                                          |

外側は既存形式の `{ data, requestId }`。内部scopeとAI原価を明示的に除外し、投稿本文・Memory・URL・イベント一覧も返さない。selfReportedPostsは本人の投稿完了報告であり、Instagram等での公開の証明ではない。API閲覧を活動日に加算しない。

未認証は401、入力不正は400、対象不在・失効等は404、制限超過は429とRetry-After。欠測・部分取得・scope不整合は503とし、空の成功や入力ミスへ変換しない。不明障害は既存マッピングの500で詳細を隠す。全レスポンスにprivate, no-store / Varyを付ける。

### 負荷制限

本人IDでService / Bunshinを跨いで共有し、1分10回、同時1件、最大1,000ユーザーに制限する。メモリへ利用履歴や集計結果は保存しない。期限内の項目を押し出さず、容量超過も拒否する。障害時を含めfinallyで実行枠を解放する。

これはプロセス内の負荷制限で、分散・永続の共通Rate Limitではない。複数インスタンス全体の厳密な上限は別タスク。AI APIを呼ばず、新たなAI原価は発生させない。

## 4. 実行した検証

Node 24.22.1、pnpm 10.10.0。

- 新規HTTP / guard: 2ファイル29件成功
- 関連する投稿成果HTTP・認証経路inventoryと合わせたWeb検証: 4ファイル232件成功
- 既存Application集計: 23件成功
- Prisma Client生成、Web全体TypeScript検査: 成功
- 新規TSファイルのESLint、Prettier、依存境界検査、git diff --check: 成功

HTTPテストは実際のGetMemberUsageSummaryを通し、認証・DB・guard境界をmockしている。PostgreSQL所有境界の実装を変更したテストや、本番接続確認とは扱わない。実DB Adapterの21件を含む既存SQL統合はCIのdatabase jobで再検証する。

リポジトリ全体のformat / typecheck / lint / test / learning UI / build、migration readiness、全DB統合・release・TLSはPRのCI verify / databaseを最終ゲートとする。最終コミットと結果はPR本文へ記録する。

## 5. 未解決事項

- 利用実績画面・成長ロードマップ評価 / UIは次PR。今回のAPIを既存画面からは呼び出していない。
- 紹介・画像 / 動画・自動化等の追加指標と、長期の大量履歴へのページング / SQL集計は後続。既存のSource上限を超える場合は503を返す。
- 分散Rate Limitの整備と本番での制限確認は未実施。
- 本番デプロイ、DB接続、Feature Flag有効化、外部AI・SNS操作は行っていない。

## 6. 次へ進める条件

- 本PRのレビュー、CI verify / databaseの成功とマージ。
- 次のUIは今日の行動を優先し、未取得・欠測を0件の達成として表示しない。投稿完了報告とSNSでの公開確認を区別する。
- 100社運用に向けて、公開範囲・複数インスタンス時の負荷制限・Source上限を別途確認する。
