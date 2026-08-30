# サービス専用ホーム 実装報告

## ゴール

参加完了後に共通のBunshin一覧へ移動させず、参加したサービス専用の入口から利用を続けられるようにする。

## 実装

- `/s/{serviceSlug}/home`を追加
- サービス名、ロゴ、色、フォント、運営者、問い合わせ先をサービス設定から表示
- verified sessionを必須化
- slugから解決したworkspace・serviceと、ログインユーザーの`ACTIVE` Membershipをサーバー側で照合
- 利用可能な画像・動画機能だけを表示
- サービス管理者には、参加者、公式資料・FAQ、法務文書、バッジの管理導線を表示
- 参加完了後のボタンを共通`/bunshins`からサービス専用ホームへ変更

## データ分離

画面からservice IDを受け取って信用せず、公開slugをサーバー側で解決する。表示する機能は対象GroupのFeature Policyと対象MembershipのAssignmentがともに有効な場合だけに限定する。

ポイント・個人バッジ・Bunshin・Missionは現時点でworkspace単位のデータが残るため、この専用ホームには表示しない。これらはMS-2のService Data Isolationで分離した後に接続する。

## 後続

MS-2ではBunshin、Mission、ポイント、バッジ、生成履歴をservice ID相当のGroup IDで分離し、サービス専用ホームへ段階的に接続する。
