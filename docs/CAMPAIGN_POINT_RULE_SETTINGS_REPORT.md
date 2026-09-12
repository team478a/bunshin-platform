# 募集別ポイント付与設定 実装報告

## 1. 調査した内容

ポイント付与処理とデータモデルは `campaignId` を持ち、募集固有のルールをサービス共通ルールより優先できました。一方、サービス運営者が募集ごとのルールを登録・停止する画面と操作はなく、利用者画面も参加中の募集固有ルールを表示していませんでした。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/manage/points/page.tsx`
- `apps/web/app/(app)/points/page.tsx`
- `apps/web/test/service-point-settings-boundary.test.ts`
- `packages/application/src/point-core.ts`
- `packages/application/test/point-core.test.ts`
- `packages/database/src/index.ts`
- `packages/database/test/point-dashboard-service-scope.test.ts`

## 3. 主要な設計判断

- 募集中または準備中で、終了前の募集だけを設定対象にします。
- 各付与条件は「サービス設定を使う」「募集専用のポイント数」「この募集では付与しない」の3状態から選べます。
- 募集専用ルールは既存の版管理を利用し、変更前のルールを削除しません。
- 募集ごと・付与条件ごとに発行予算上限を設定でき、発行済み額を下回る変更を拒否します。
- Workspace、サービス、募集の一致を保存処理内で再確認します。
- 利用者には、現在参加中かつ開催中の募集に設定された有効なポイント条件だけを表示します。
- 設定変更の理由、実行者、変更前後を既存のサービス監査ログへ保存します。

## 4. 実行した検証

- 関連テスト: application 6件、database 2件、web 17件が成功
- 型検査: application、database、webが成功
- 全体テスト: 19タスクが成功（application 451件、database 253件、web 903件を含む）
- 全体lint: 19タスクが成功
- 本番ビルド: 10タスクが成功
- `git diff --check`: 問題なし

## 5. 未解決事項

キャンペーン終了後のルールと発行履歴は監査のため保持します。終了済みキャンペーンの設定変更画面は提供しません。

## 6. 次Phaseへ進める条件

GitHubの必須チェックが成功し、PRをレビューできる状態にすることです。
