# SNS支援の権限・次の行動・見送り履歴の接続

日付: 2026-11-02 / 基点: main 052bc374（#1433）

## 1. 調査

既存のBarrier推論、質問、回答別Support、採用・完了・見送り、30日抑制、
Scheduler、Improvement観測を確認した。新しい推薦エンジンや台帳を作らず、既存経路を拡張する。

不足していたのは、本人向け読取・書込みでの現在の同意・Capability・機能権限の再検証、
採用済み投稿案から投稿完了報告へ進まない信号、進行中支援の優先表示、
回答競合・厳密な再送照合、見送り理由と支援後の抑制、実装済み操作への案内だった。

## 2. 変更ファイル

| 責務                   | ファイル                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SNSの課題判定          | packages/capability-social/src/activity-barrier.ts                                                                           |
| 見送り理由の契約       | packages/capability-social/src/activity-barrier-support.ts                                                                   |
| 認可・保存・再送・抑制 | packages/database/src/social-activity-barrier-confirmation-repository.ts                                                     |
| 最小保存               | schema.prisma、20261102180000_social_support_confirmation_receipt/migration.sql                                              |
| API                    | apps/web/src/http/service-social-activity-barrier.ts                                                                         |
| 画面                   | activity-barrier-card.tsx、service-bunshin-detail-view.tsx                                                                   |
| テスト                 | social-support-access.integration-cases.ts、social-support-access-http.test.ts、既存SNS/DB/UIテスト、activity-support.e2e.ts |

共有ファイルの変更: database.integration.test.tsはimportと登録の追記のみ。
e2e.config.ts / main.tsxに実際のCardを使うテストを追加。
schema-readiness.tsの最新migration名を更新した。

## 3. 設計判断

### 共通・SNS・サービスの分離

所属・同意・Workspace/User/Bunshin所有権は既存の共通認可helper、
機能権限は既存Entitlement Resolverを利用する。
SOCIALの活動の意味と支援選択はSOCIALに置き、Hassyの5段階・人数特典・MUSEを固定しない。
Webは実在する投稿準備、事業者向けの手動実績記録、既存Photo Firstの導線を渡す。
条件の不明な有料機能や未実装の予約投稿・外部接続は案内しない。

### 現在の権限と停止

表示・回答・採用はACTIVE User / Workspace / Service / Membership、現在の同意、
Bunshin所有権とACTIVEなSOCIAL Capabilityを確認し、
SOCIAL.ACTIVITY_SUPPORTおよび親機能のGroup / Member権限と有効期間を照合する。
停止や未割当では新しい質問・支援表示・回答・採用を許可しない。
本人による完了・見送りの記録には、停止した支援機能の再開を要求しない。
所有権・同意・Capabilityの確認自体は省略しない。
APIはstrict入力検証、same-origin、private no-storeとVary、既存のprocess内読取Rate Limitを使う。

### 行動から支援への接続

既存28日観測の中で採用が2件以上あり投稿完了報告がない場合、
TIME / HOW_TO / CONTENT / CONFIDENCEをSUSPECTED候補として提示する。
コピー後の停滞など既存ルールの優先順は維持する。
推論版をv4にし、v1〜v3の読取と凍結済み支援を維持する。
採用や報告から実際のSNS公開を証明したとは扱わない。

進行中の支援を新しい質問で隠さず、採用後に次の操作を1件表示する。
リンクはサーバー画面で提供する既存の操作先から選び、応答JSON内の任意URLを使用しない。
Bunshin切替時にはCardを再マウントして前の支援状態を引き継がない。
不完全な成功応答では、支援開始・完了に進めない。

### 最小保存と競合

既存ConfirmationにnullableなrequestSnapshotだけを追加する。
過去の質問候補集合はmutableなCaseから再構築できないため、新規回答の正規化した
caseIds / selectedCaseIdを保存し、同じidempotencyKeyと同じ要求だけを再送成功にする。
旧レコードへ要求を推測して埋めない。旧回答の再送は拒否しても、凍結済み支援の読取は維持する。
再送時も現在の認可を確認し、Goal別支援を現在のcatalogから作り直さない。

書込みは本人のBunshin行で直列化する。同時回答から複数のInterventionを作らない。
見送り理由（任意・最大500文字）は既存definitionSnapshot.feedbackに追加し、
元の支援定義・選択情報を保つ。SKIPPEDとCaseのDISMISSED / 30日nextEligibleAtを同じtransactionで更新する。
再送で理由を上書きしたり抑制期間を延長したりしない。

### 原価と実行

今回の候補と操作リンクは、無償の定型ガイド・画面表示だけを行う。
LLM、画像生成、外部Agent、SNS投稿、OAuth接続を呼ばない。
画面を開いた後に生成等を使う場合の権限・原価・本人操作は既存の実行APIで検証する。
AI障害や原価上限を理由に、この手動支援のための追加AI呼出しは発生しない。

## 4. 検証

- ローカルPostgreSQL 16: 全269 migration適用、readiness、全345 SQL結合テスト成功。
- 追加SQL13件: 認可・停止・期間・同意・Capability、他OEM/Bunshin、回答再送と競合、
  進行中支援の優先、理由付き見送りと30日抑制、停止後の完了、旧レコード。
- SOCIALの全375テスト、既存DBの回答/支援テスト、API入力・所有権・Rate Limitテストを確認。
- モバイルと標準format / typecheck / lint / test / buildの最終結果はPR本文とCIに記録する。

## 5. 未解決・本番状況

実装と合成データ検証の段階。本番migration・設定・Feature Flag・デプロイは未実施。
GroupだけでなくMemberにも既存管理画面から必要な権限を付与することが前提になる。
無条件に全会員へ有効化するseedはない。

今回の閾値は既存SNSルールの版管理に従う標準値であり、新しいOEM閾値編集画面は追加していない。
画像多用・複数SNS・紹介人数による全候補の追加、3/5/10人の体験権限自動発行、
有料自動化の原価見積り、MUSE実接続、提案の表示/実利用イベントの拡張は未実装。
完了ボタンは本人の支援完了記録であり、実投稿・負担軽減の因果証明ではない。

## 6. 次へ進む条件

本PRのCIとレビューを通す。次は既存Improvement観測に固定期間の支援前後比較を接続し、
サービス固有の特典catalog・期間・本部上限が確定している範囲だけで人数特典と提案を拡張する。
未設定の体験権限を紹介人数だけで自動発行しない。
