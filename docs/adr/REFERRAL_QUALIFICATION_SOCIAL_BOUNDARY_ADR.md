# B3前半: 紹介の共通判定とSOCIAL証拠の分離

日付: 2026-11-02  
基点: origin/main `8d8f81b7`

## 判断

既存の資格評価器は本番呼出しがなく、Applicationの公開入口にSNS固有条件が混在している。
ApplicationにはWorkspace / Service / 会員の紹介境界、自己紹介拒否、登録・新規参加、
帰属の一意性、審査・不完全性・停止の共通gateを残す。
gateの成功は`CONTINUE`とし、有効紹介の確定や特典付与を意味する`QUALIFIED`とは区別する。

初期設定・初回本人生成・実操作日、Bunshin別の証拠検証と日付unionは
capability-socialへ移す。SNS評価器が共通gateを呼び、既存のv1結果と判定順序を維持する。
ApplicationからSOCIALへの再exportや逆依存は作らず、既存テストの参照をSOCIALの公開入口へ移す。
旧ApplicationのSNS型・関数の公開位置はprivate package間の内部契約変更であり、
HTTPや保存済み結果の契約変更ではない。リポジトリ内の利用箇所を全件確認する。

全サービスに架空のBunshinを要求せず、共通gateはBunshin・投稿・Provider・ブランドを知らない。
SNSの判定は引き続きSNS条件付きであり、完全な汎用条件エンジンを新設しない。
ハッシーの1/3/5/10件特典や初期値を共通gate/SOCIALの既定値にしない。

## 保存の境界

紹介関係は既存ServiceReferral、Creditの付与予定/確定/取消はServiceReferralReward、
残高と履歴はServiceCreditAccount / ServiceCreditLedgerを正本として維持する。
既存報酬ルールの版管理・作成者記録・管理者認可を再利用する。
専用の設定変更監査ログや審査/取消フローが完成済みとは扱わない。
新資格の確定・ルール版は不足を明示し、新規参加は既存会員監査から再構築できる範囲を先に確認する。
再構築不能な操作事実だけを追加保存の候補にし、
今回schema・migration・本番書込み・新たな紹介/報酬テーブルを作らない。

純粋評価を認可の証明やDB確定として利用せず、validReferralsは未接続のnullを維持する。
DB接続は別PRで、保存する事実・一意性・版固定・失効・旧特典非遡及とmigration範囲を確定してから実装する。
