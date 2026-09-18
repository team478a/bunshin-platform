# AI物販V1 参加者Action画面 実装報告

## 1. 調査した内容

- 既存のProgram Runtimeが保持する現在Assignment、進捗Snapshot、Action Eventの読み書き経路
- 公開Service参加者の認証、Membership、Workspace、Group境界
- AI物販Policyが返す`WORK`と`WAIT`、商品状態遷移、DAY7分類の接続方法
- 既存の参加中プログラム画面とスマートフォン向けService UI

## 2. 変更したファイル

- `packages/capability-resale/src/participant.ts`
- `packages/capability-resale/src/runtime.ts`
- `packages/database/src/resale-participant.ts`
- `packages/database/src/resale-runtime.ts`
- `apps/web/src/http/ai-resale-participant.ts`
- `apps/web/app/api/services/[serviceSlug]/program-enrollments/[programEnrollmentId]/current-action/route.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/*`
- `apps/web/app/s/[serviceSlug]/programs/*`
- 関連するexport、CSS、自動テスト

## 3. 主要な設計判断

- 現在Actionの正本は既存`ProgramProgressSnapshot.currentAssignmentId`とし、新しいAction表を作らない。
- 参加者は自分の有効な`PARTICIPANT` Membershipに属するAI物販Enrollmentだけを操作できる。
- 結果記録、商品状態、Action Event、Progress更新をSerializable transactionで一括保存する。
- 結果保存後は同じ画面でPolicyを再評価し、次のActionを直ちに表示する。
- `WAIT`は完了操作を表示せず、次回確認予定だけを表示する。
- 送信単位のUUIDを再利用し、通信再試行による商品・Eventの二重作成を防ぐ。
- DAY7到達時は次のActionを作らず、既存のDAY7分類処理へ接続する。

## 4. 実行した検証

- Capability unit test: 現在Action生成、結果後の次Action、WAIT拒否、DAY7分類、再送
- Database boundary test: Tenant・参加者境界、Serializable transaction、冪等性、商品Event
- Web boundary test: セッション、Service Membership、same-origin、厳格入力、スマートフォンUI
- `lint`、`typecheck`、`test`、`build`をリポジトリ全体で実行する。

## 5. 未解決事項

- LINEから現在Actionへ移動する参加者別通知とディープリンク
- DAY7分類後に表示する有料90日プログラムのOfferと一括決済
- 実運用環境でのLINE内ブラウザによる端末確認

## 6. 次の作業へ進める条件

- 本変更のCIが成功し、PRがレビュー・マージされること
- 次は現在ActionのLINE通知とディープリンクを実装し、その後にDAY7 Offerと決済へ進む
