# ハッシー追加質問の見送り・再表示制御 実装報告

## 1. 調査と目的

基準: `main` `d55fb0ec`（PR #990マージ後）。初回5項目の入力、H2/H3のBarrierは既存実装を維持する。ホームと`refine=1`画面には低情報回答を1問ずつ出す処理があるが、見送り、表示間隔、履歴がなかった。`edit=1`も追加質問扱いになっており、手動の全回答編集への入口がなかった。

## 2. 変更と設計判断

- ホームと追加質問画面に「あとで答える」を追加した。見送りは回答を変更せず、該当質問を7日間候補から除外する。
- 初回登録・回答保存・見送りから24時間は追加質問を提示しない。期限を過ぎると未回答の候補を1問だけ表示する。
- 質問文で照合するため、並び替えで別質問を見送らない。回答済みは候補から除き、`X`等の1文字の有効回答も未回答扱いしない。
- `refine=1`は休止中・候補なしの場合ホームへ戻す。未登録時のqueryによる初回入力の回避は認めない。`edit=1`は全質問の手動編集として分離し、サービスのアカウント画面から利用できる。
- Service Membershipに結びつく既存回答行へJSON状態と次回提示日時を追加した。新規の個人共通プロフィールやBunshin Memoryは作らない。履歴は直近20件、回答本文は含めない。
- 見送りAPIは同一Origin、認証、活動中のWorkspace/Service/Membership、現在の質問候補を検証する。全所有境界と更新日時のcompare-and-setで並行回答を保護する。期限内の再送は履歴・期限を増やさない。
- 判断はDecision Log D-130。AI呼び出し、通知、配信設定には変更なし。

## 3. 変更ファイル

- `apps/web/src/services/service-onboarding-response.ts`: 候補選択・休止・見送り状態の純粋関数
- `apps/web/src/http/service-onboarding.ts`、`service-onboarding-refinement.ts`、専用POST route: 保存・所有境界・競合検証
- サービスhome/onboarding、`defer-refinement-button.tsx`、account: スマートフォン向け操作・手動回答導線
- Prisma schemaと`20260928120000_add_onboarding_refinement_deferral`: 既存回答を保持する追加migration
- Webのpolicy/HTTP/UIテスト、DB schema/integrationテスト
- Decision Log、ロードマップ、本報告

## 4. 検証

- 関連Vitest、lint、typecheck、format、build、DB migrationと実PostgreSQL統合テストを検証する。結果はPRの最終検証欄へ記載する。
- 自動テスト対象: 24時間・7日間の期限境界、並び替え、回答済み、重複POST、履歴上限、壊れた旧データ、認証、Origin、入力偽装、所有境界、並行回答、DB障害、手動編集・初回入力の分離。

## 5. 未解決事項と次の条件

- コード実装と本番反映は別。本番migration、デプロイ、実端末でのクリック確認は未実施。新migration適用後に本番反映し、見送り→非表示→手動編集の導線を確認する。
- 既存行の提示日時はNULLを維持し、一括で休止させない。初回登録・回答保存・見送りの次の操作から24時間の休止を適用する。
- 本PRのレビュー・CI・マージ後に次の独立した機能へ進む。AI研修の削除・Export・保持期限には保存期間と削除権限の決定が必要であり、推測で実装しない。
