# 外部読取の分散制限・監査: 既存資産監査と次の実装単位

## 1. 調査した内容

基準mainは`4a856e2d`。2026-11-03時点でPR #1446はOPENであり、認証資格の結合はmainへ未反映。本書は後続実装の準備で、分散制限や公開APIの実装完了を意味しない。

AGENTS、仕様正本、Architecture Principles、Implementation Roadmap、Decision Log、外部読取ADR、Applicationの公開入口・Core、DB schema・既存admission、本人向け管理HTTPを確認した。

| 既存資産・実装ファイル                                                                        | 実装済みの内容                                                                   | 不足・再利用方法                                                                                 | 検証・本番状況                                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `packages/application/src/external-connection-read.ts`                                        | grant前後照合、5秒上限、必須admission/audit Port、遅延結果破棄、失敗時の固定分類 | 調整処理を再利用。DB Adapterは未実装                                                             | 合成テストあり。外部公開の証拠なし                          |
| `packages/database/src/external-read-grants.ts`                                               | 本人の全scope、失効・期限・Feature照合、許可発行/解除                            | 認可の正本として再利用。読取leaseをgrantの期限やrevisionへ混在させない                           | 既存SQLテストあり。本番反映は未確認                         |
| `apps/web/src/http/external-read-grant-owner.ts` / `member-usage-read-limit.ts`               | 本人向け管理操作の負荷制限                                                       | process内の制限を分散外部readの代用にしない                                                      | 管理APIテストあり。外部readは未公開                         |
| `packages/database/src/provider-configurations.ts` / `AiProviderCallAdmission`                | PostgreSQL advisory lock、DB時刻、Provider原価予約とsettle                       | 排他・DB時刻の手法を再利用。Provider設定/FK・原価台帳を外部readへ流用しない                      | 既存実装・テストあり。本番稼働は本調査で未確認              |
| `packages/database/src/personal-learning-call-admission.ts` / `PersonalLearningCallAdmission` | Program単位の排他、試行hash、原価予約                                            | 手法だけ再利用。研修・Job・Programの権限を外部readへ持ち込まない                                 | 既存実装・テストあり。本番稼働は本調査で未確認              |
| `packages/database/prisma/schema.prisma` / `GroupFeatureAuditLog`                             | Workspace/Group/会員・実行者に結びつく設定変更の監査                             | grant発行/解除の監査を維持。存在しない接続IDや未認証の拒否を、所有者による操作と偽って保存しない | 既存監査・SQLテストあり。外部readの成功/拒否Adapterは未実装 |
| 同schema / `GroupFeatureUsageEvent`、AI/Media予約、Job lease                                  | 機能利用・原価・Job実行の個別正本                                                | read監査を活動日やAI利用回数へ重複計上しない。Job leaseを同期readの実行許可にしない              | 外部read向けの共通永続モデルとしては未対応                  |
| PR #1446                                                                                      | OAuth資格とgrantの結合、通常ログインとの境界                                     | マージ後のmainで再確認して利用。未マージコードをmain実装済みとしない                             | PRのCI成功と本番認証確認は別                                |

## 2. 変更したファイル

本書のみ。コード、schema、migration、公開入口、依存関係、Feature、catalog、本番設定は変更していない。

## 3. 主要な設計判断・実装候補

以下はレビュー対象の設計案。既存admissionを横断する巨大な共通基盤への改修は行わず、外部readに必要なAdapterへ限定する。

### 分散制限

- Applicationの認証・認可済みgrantを入力とし、environment/client、connection、environment/userの三軸をすべて制限する。user軸はBunshinやServiceを切り替えても回避できない。外部JSONに任意のscopeを追加しない。
- PostgreSQLの短いtransactionとDB時刻でrate判定と有効lease数判定・予約を原子的に行う。同じ軸を全workerで同じ順序にlockし、別connectionの同時要求でもuser/client上限を突破させない。readや外部通信の間はtransactionを保持しない。
- 許可数・期間・並行数・lease期限にはサーバー側の検証と上限を設ける。設定欠落・不正値・DB障害は閉じる。初期数値は負荷試験とレビューで確定し、無制限の既定値を置かない。
- 予約失敗はどの軸にも中途半端な予約を残さない。予約成立後のread失敗や再送もrateを消費する。requestIdを再利用して上限を回避させない。
- leaseの識別子を使って冪等に解放する。worker停止時はTTLで回復し、期限後の古いreleaseが新しいleaseを消さない。rate履歴はreleaseで消さない。
- 現在のPortは`release(): void`であり、DBへの非同期解放を待てない。実装時は`void | Promise<void>`等への最小変更とCoreのawait・上限時間・失敗分類を同時に検証する。fire-and-forgetでDBエラーを握りつぶさない。
- 5秒timeoutはread処理そのものの終了を保証しない。AdapterはAbortSignalを尊重し、DB queryにも上限を付ける。TTL切れ時に古い処理が継続するケースを負荷・障害検証に含める。

### 監査

- grant発行/解除/結合は既存GroupFeatureAuditLogを継続利用する。読取監査には、未解決connectionも記録できる最小のメタデータ保存が必要。設定変更監査の実行者やFKを捏造しない。
- 保存候補はversion、サーバー発行attempt ID、requestId、connectionId、clientId、environment、operation、固定outcome、count、DB時刻のみ。外部入力のrequestIdを一意な実行IDとみなさない。
- token、subject、session、メール、投稿本文、応答payload、原価、raw error、JWT、任意のリクエストbodyを保存しない。識別子・分類・長さを検証し、未認証リクエストを無制限にDBへ書かない。入口の粗い制限は認可後の分散制限と別に必要。
- 既存CoreのREAD_COMPLETEDは読取完了のreceiptであり、応答配信成功ではない。その後の失効照合でDENIEDが追記され得る。成功率集計はattempt単位の最終結果を扱い、receipt数を配信数として数えない。
- 監査障害時はデータを返さない。失敗監査の500ms上限、重複/再送、成功receipt後の失効、timeout後の遅延書込みも検証する。
- 保持期間、削除権限、最小限の運用者閲覧、index・削除batchの負荷を実装時に定義する。利用者の活動原本・ロードマップ達成イベントにはしない。

新規保存が必要なのは復元できない予約/leaseとread試行のメタデータに限る。具体的なschemaとmigrationはPR #1446マージ後に最新mainの重複確認・ADR更新を行って確定する。

### 共通機能とハッシー固有機能

分散制限・read監査・資格検証・grantは全サービス共通の接続境界。利用実績のSNS項目は既存の限定投影を使う。ハッシーのロードマップ段階、推薦文、紹介特典条件、Museガイドをこの基盤へ埋め込まない。CoreへSupabase SDKやPrismaを追加せず、Application Port、DB Adapter、Web compositionの依存方向を守る。

## 4. 実行した検証

コード・schema・公開入口の読み取り、PR状態とmain SHAの確認、文書の整形・diff検査を実施する。実行結果はPR本文へ記録する。今回runtimeを変更しておらず、新しい分散制限の動作・実DB競合・Muse実接続を検証済みとは扱わない。

## 5. 未解決事項

分散制限/監査Adapter、非同期release、公開read/bind入口、OAuth Server/PKCE/正式client登録、Provider session失効連動、実機互換・費用・OEM条件は未完了。catalogは空のまま。本番DB・認証設定・デプロイは未操作。

## 6. 次の作業単位と品質ゲート

1. PR #1446をマージした最新mainで、分散admission・監査Adapterと最小migration、release契約の修正を一つの実装PRにまとめる。公開routeとcatalog登録は含めない。
2. 独立Prisma clientを使う並行SQLテストで三軸上限・環境分離・日付/期間境界・TTL・遅延release・rollback・監査障害を再現する。Applicationではtimeout/失効後に結果が返らないこと、release失敗の扱いを検証する。全標準CIとSQLを通す。
3. Adapter品質ゲート通過後、Bearer専用の限定read/bind境界とHTTPテストを実装する。Cookie fallback、caller指定principal、公開API経由の既存会員権限の転用を禁止する。
4. テスト本人のProvider認可/接続/解除、運用・費用・保持方針、Muse互換を確認して、catalog登録と限定PoCを別途判断する。PRマージを本番提供や外部接続の証拠にしない。
