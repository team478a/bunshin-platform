# ADR: 有効紹介の資格判定Core

作成日: 2026-11-02
Status: Accepted for Phase 2-A implementation.

## 既存資産と差分

- ServiceReferralはサービス内の被紹介Membershipに一意で、成果段階と登録・初期設定・本人の投稿完了報告日時を持つ。
- ServiceReferralRewardRuleは初期設定完了 / 初投稿報告に対するクレジット特典を版管理する。ServiceReferralRewardとCredit Ledgerは既存の付与・取消・冪等キーを再利用する。
- 現行の登録処理はMembershipのupsert後に紹介関係を作る。REGISTEREDとregisteredAtだけを新規参加の確証にしない。日時差の許容幅を推測して新規と判定しない。
- 初回の本人操作による生成、活動日数、新規参加の確証、調査待ちを合わせた資格判定と、その版付き保存・管理は未接続。既存の報酬数や成果状態を有効紹介数に読み替えない。

## 決定

- 最初はApplicationの副作用のない判定Coreを追加する。DB / HTTP / Scheduler / 管理画面 / ロードマップへの接続は次の独立PRとする。validReferralsはnullのまま維持する。
- ルールはWorkspace / Service、ruleKey、正のversion、ACTIVE / SUSPENDED、timezone、新規参加・初期設定・本人生成の必須条件、最低活動日数を明示する。暗黙の本番初期値や有効化を行わない。
- 証拠は同Workspace / Service内の紹介関係、紹介者・被紹介者のMembership / User、登録・初期設定日時、新規参加・紹介一意性の確認可否、完全性、旧生成起動元の不明、調査状態、実利用イベント時刻だけに限定する。氏名・メール・IP・本文・Memory・SNS公開証明を扱わない。
- ログインやScheduler / SYSTEM / UNKNOWN起動・失敗生成を本人生成へ投影しない。既存Usage Aggregatorが対象にする実利用を、内部AdapterがUSER_GENERATION / DECISION / COPY / POST_REPORTへ投影する契約とする。このCoreは新しい行動イベントの保存先ではない。
- 活動日はルール版のtimezoneで重複を除く。登録前・asOf後の事実は使わない。Bunshinごとの活動日数を足し合わせない。将来のAdapterは同Service・本人所有Bunshinの許可されたイベント時刻だけを集約し、本文やMemoryは共有しない。
- 既存の自己紹介拒否helperを再利用する。自己紹介・既存REJECTEDは拒否。紹介の一意性が否定された場合や調査対象は自動的に不正と断定せずREVIEW_REQUIRED。未確認・部分取得・必要な旧生成情報の不明はUNKNOWN。未達条件はPENDING。
- QUALIFIEDは、このルール版・評価時点の条件を確認できたという内部の評価結果であり、DB確定・特典付与・機能開放・紹介者への個人情報公開の許可ではない。実行時の認可・一意性・冪等付与は既存境界で再確認する。
- ルール変更による再評価は別versionの結果とし、保存済み確定成果・特典を遡及変更しない。保存・監査・復旧・集計を設計する次PRまでは既存状態や台帳を書き換えない。

## 次の接続条件

既存テーブルとの重複を避けたルール・判定結果の保存先、管理権限、認可と証拠取得、同一被紹介会員の一度限りの確定、旧データの不明、特典の版固定と取消を確認する。DB変更が必要な場合はその作業単位で許可・migration・統合テストを揃える。
