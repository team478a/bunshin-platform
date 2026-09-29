# 非公開サービスの初回回答・紹介コード・本人専用URL API 修正報告

日付: 2026-09-29。基準: main `7edb51d1`（PR #1014マージ後）。参加者API監査の第4作業単位。本番反映とは区別する。

## 1. 調査した内容

- 初回回答保存、紹介コード発行、本人の代理店URL保存は認証済み参加者操作だが、公開限定Service Resolverを使っていた。
- 初回回答と代理店URLは厳格Schemaの例外が500へ変換されていた。紹介コードはResolverの未知障害までcatchで404へ変換していた。
- 紹介先の匿名導線 `/r/[code]` はPUBLIC、紹介有効、利用期間と有効所属を条件とする。既存参加者のコード発行とは異なる条件を維持する。

## 2. 変更したファイル

- `apps/web/src/http/service-onboarding.ts`: Member ResolverとSchema不一致の400変換。
- `apps/web/src/http/service-referral-code.ts`: Member Resolver、未知障害の404握りつぶしを除去。
- `apps/web/src/http/service-member-tracking-link.ts`: Member ResolverとSchema不一致の400変換。
- `apps/web/test/service-onboarding-referrals-http.test.ts`: 3操作の実行、Service切替、認証/所有拒否、事業プロフィール、紹介/URL条件を追加。実Application Serviceを使い、DB Port/認証/Resolver/QRのみmockする。
- 初回回答の既存テストmock、紹介/URLの静的境界2テストを更新。
- D-151、Roadmap、機能不足監査、この報告。

## 3. 主要な設計判断

- 認証後にMember Serviceを解決し、サーバーのWorkspace/Groupと操作者を使用。既存の利用期間・ACTIVE Workspace/Group/所属認可を維持する。
- 質問数・スナップショット・事業プロフィールFULL/MINIMALと業種検証を維持。千ノ国等で不要な業種を要求せず、ハッシー等の必要項目を省略しない。共通Userプロフィールへ保存しない。
- 自Serviceの所属キーに保存し、既存の紹介Milestoneと本人限定投稿パートナー取得/必要時作成、追加質問の休止日時を維持する。
- 紹介コードは紹介有効設定、ACTIVE本人所属、停止済みコード拒否、Service/Workspace/所属別の安定Hash、skipDuplicatesを維持。コード発行対応は非公開Serviceへの匿名参加許可を意味しない。
- 代理店URLは自Service限定Repositoryと実Application Serviceの所属再照合・許可System/Domain・HTTPS/個人情報query拒否・DRAFT保存を維持する。
- 入力Schemaのフィールドや型は広げない。safeParseAsyncの不一致を400、未知Resolver障害を500へ既存エラー変換で返す。

## 4. 実行した検証

- 関連6ファイル79テスト成功。新規HTTP実行52テスト、既存追加質問休止、紹介/URL静的境界、Service設定/共通登録分離を含む。
- アーキテクチャ境界とその否定テスト10件、変更ファイルのformat、`git diff --check`成功。型/lint、全WebとCIの最終成否はPR/作業報告へ記録する。
- 本番DB、LINE、AI、Storage、実QR Providerへ接続しない。DB schema/migration変更なし。

## 5. 未解決事項

- 商品紹介・動画通知等の参加者APIと、画面に残る公開限定判定は別監査。全Service対応完了とは報告しない。
- 所属や設定の同時変更に対する新たな排他保証は追加しない。既存Repository/transaction条件を維持する。
- 非公開Serviceの紹介コードは発行できても、PUBLICになるまで匿名紹介先は404のまま。公開状態を変更しない。
- 本番反映と実スマートフォンでのフロー確認は別作業。

## 6. 次へ進める条件

- 本PRのCI成功・レビュー・マージを確認する。
- 次の参加者APIを匿名/参加者/管理者の意図と自Serviceの機能設定で監査する。本番リリース・設定変更は別途扱う。
