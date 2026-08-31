# 実践プログラム管理 AV-2 実装報告

## ゴール

プラットフォーム管理者が公式の実践プログラムを用意し、サービス管理者が自サービスへ採用して、参加者を無料・招待限定で手動参加させられる状態にする。

## 実装したこと

- プラットフォーム管理画面から公式プログラムと最初の公開版を作成
- サービス管理画面から公開済み公式プログラムを採用
- 採用時に無料・招待限定・手動参加の提供条件を作成
- サービス内の参加者、支援方法、任意目標を選ぶ手動参加
- プログラム管理画面への管理者導線
- 作成、採用、参加操作の監査記録

## 権限とデータ分離

- 公式プログラム作成はACTIVE SUPER_ADMINだけに限定する。
- サービス操作はACTIVE SERVICE_OWNER／SERVICE_ADMINだけに限定する。
- 採用できるのは公開済みPlatform版または自サービス所有版だけとする。
- 参加対象は同じWorkspace・Serviceに所属するACTIVE PARTICIPANTだけとする。
- Program、Offering、MembershipのWorkspace・Service一致をサーバー側で再検証する。
- 作成、採用、参加はそれぞれ監査記録を含む単一Transactionで保存する。

## 初期提供条件

- 価格は無料
- 参加は招待限定
- 参加登録は管理者の手動操作
- 支援方法は`IDEA_ONLY`、`GUIDED`、`READY_TO_USE`からProgramが許可するものを選択
- 参加時の提供条件と目標をEnrollmentへSnapshot保存

## 今回実装していないこと

- Checkout、決済、請求、返金
- 売上分配、代理店報酬
- 有料Offering
- 動画生成Providerの自動実行
- 利用者自身による公開登録

これらは無料招待実証の結果を確認した後の別Phaseで扱う。

## 検証

- Web TypeScript型チェック
- Web ESLint
- Program管理境界テスト
- サービス管理権限テスト
- 別Workspace、別Service、別Membershipを混入させないこと
