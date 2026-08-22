# Phase 6-F2a LINE Delivery Core 実装報告

## ゴール

LINE Identity / Connectionを実装する前に、二重送信を防ぐ配信実行境界、Messaging API Adapter、Provider障害分類、月間quota優先制御を完成させる。実ユーザーへのPush、Webhook、LINE Login、再送UIは本Sliceへ含めない。

## 実装範囲

- `LineMessageDelivery`へ`PROCESSING`、attempt count、lease owner、lease expiryを追加
- environment固定のatomic claimと期限切れlease回収
- lease owner / attempt番号を条件にした成功・失敗記録
- ACTIVE・接続確認済み・同一環境のLINE設定だけを解決するAdapter
- Messaging API quota / consumption取得とPush Adapter
- credential、rate limit、invalid recipient、timeout、provider unavailableの分類
- 全体停止、Reminder停止、全送信停止のpolicy Gate
- 受信者解決を`LineRecipientResolverPort`として分離

## 配信優先順位

- 使用率がwarning閾値以上: Daily Missionを継続し、呼出元へwarningを返す
- low priority停止閾値以上: Reminderを停止し、Daily Missionを継続する
- 100%以上: Daily Missionを含む新規送信を停止する
- quota無制限契約: quota Gateを通過する

設定の初期値はwarning 80%、Reminder停止90%である。管理者への警告通知自体はPhase 6-Gへ分離する。

## Security / Privacy

Access Tokenは管理画面やApplication inputから受け取らず、同じruntime environmentのACTIVE設定から実行時だけ復号する。Token、recipient ID、Provider response、Mission本文、Knowledgeを配信履歴・attempt・logへ保存しない。

Push内容は「今日のミッションができました」と短期Deep Linkだけに固定する。ApplicationはLINE HTTP型を参照せず、Provider Adapterから分類済み結果だけを受け取る。

## 二重送信防止

配信はDBの条件付き更新で30秒leaseを取得する。PENDING / FAILED、または期限切れPROCESSINGだけをclaimできる。同じ配信を別workerが並行取得した場合は`BUSY`としてProviderを呼ばない。完了更新もenvironment、lease owner、attempt番号が一致した場合だけ許可する。

## 後続条件

Phase 6-F2bで実ユーザーPushへ接続するには、Phase 6-B / 6-CのLINE Identity、Connection、friendship状態、notification consentを完成させ、`LineRecipientResolverPort`を所有権検証付きで実装する必要がある。
