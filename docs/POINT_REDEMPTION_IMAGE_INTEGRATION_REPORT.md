# ワタシポイント P-4B SNS画像生成連携 実装報告

## 1. ゴール

グループ向けSNS画像生成をワタシポイント交換へ安全に接続し、失敗時にポイントだけが失われない状態を作る。

## 2. 実装範囲

- SNS画像生成1回を50 WPの交換対象として既存カタログから取得
- 既存認可後の短期予約、Job受付後の確定
- Provider実行前の本人・Workspace・画像Request・交換状態の再確認
- Job受付前失敗時の解放
- Job最終失敗時の補償返却
- 期限切れ予約を5分間隔で解放する内部処理
- 画像作成画面への必要ポイント、現在残高、残高不足表示
- 同じ画像Requestへの交換を一意にするDB制約

## 3. 安全境界

- URLや本文から対象Userを受け取らず、verified sessionのUserを利用する。
- 画像生成の既存Group・Membership・Bunshin・Mission認可を先に行う。
- Workerは`CONFIRMED`交換がなければ外部Providerを呼ばない。
- 交換検索は`workspaceId + userId + resourceType + resourceId`へ固定する。
- 技術的失敗の返却は追記型`REFUND` Transactionで一度だけ行う。
- Cron認証には既存`CRON_SECRET`を使用し、APIキー、本文、画像をログへ出さない。

## 4. 状態遷移

1. 画像Requestを`DRAFT`で保存する。
2. 50 WPを`RESERVED`にする。
3. Requestを`QUEUED`へ進め、交換を`CONFIRMED`にする。
4. Jobを登録する。登録に失敗した場合は確定したポイントを返却する。
5. Workerが交換状態を再確認してから生成を開始する。
6. Jobが最終失敗した場合は`REFUNDED`にする。

Job受付前に失敗した場合は`RELEASED`にする。15分以内に処理が完了しない予約も自動的に`RELEASED`にする。

## 5. 今回含めないもの

- 追加企画生成へのポイント接続
- ポイント購入、換金、譲渡
- Group管理者による個人残高の横断閲覧
- 画像生成以外の交換画面

追加企画生成はP-4Cで、実際の生成処理境界を確認した上で接続する。

## 6. 検証

- Applicationテスト
- SNS画像作成HTTPテスト（予約、確定、受付失敗時解放）
- Prisma Schema validate
- Application／Database／Web typecheck
- format、lint、`git diff --check`
