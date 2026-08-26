# グループ発信 Rebaseline

## 1. ゴール

グループ発信は口コミの自動量産ではなく、実在する参加者が企業の正確な情報を参照し、本人の判断と言葉で発信する支援機能とする。LINE通知、Web確認、本人承認、手動投稿を基本とし、自動投稿は実装しない。

## 2. 実装済み基盤

- Workspace / User / BunshinとIsolation
- Personality Version、Memory Selector、Grant済みKnowledge
- Generation Context Snapshot
- Social Strategy、Weekly Plan、Daily Mission
- Mission Decision / Activity、PostRecord / Feedback
- LINE通知・Deep Link・管理運用基盤

## 3. 所有権

- 企業所有: Group、Product Pack、Campaign、公式素材、商品関連監査
- 本人所有: Bunshin、Personality、Memory、Evidence、通常投稿、学習候補
- 企業管理者は通常投稿、個人Memory、グループ外投稿を閲覧できない。
- 商品関連投稿だけ、参加前に明示した範囲で監査できる。
- 退会後は企業情報を新規生成へ利用せず、人格と個人Memoryは本人に残す。

## 4. 実装フェーズ

### G1: 安全な参加基盤

Group、Membership、期限・回数付きInvitation、参加同意、辞退、退会、Workspace Isolationを実装する。

### G2: 公式商品パック

Product Pack、Version、Rule、Asset、管理API/UI、Bunshin Assignment、Generation Context接続を実装する。

### G3: Evidenceと広告安全性

本人事実Evidence、事実不要型／本人事実型、Advertising Classification、PR固定表記、固定事実照合、監査を実装する。Trend Evidenceとは別resourceにする。

### G4: 任意参加Campaign

Campaign、Participation、対象・期間・上限・素材・テーマ、参加／辞退／保留を実装する。

### G5: 計画・生成・画面

通常／商品周辺／商品紹介の比率とクールダウンをWeekly Planへ接続し、1案生成、本人修正、採否、投稿完了、LINE/Web導線を完成させる。

実装済み。Weekly Planは`ORGANIC`、`PRODUCT_RELATED`、`ADVERTISEMENT`を区別し、Campaignごとの週間上限とクールダウンをサーバー側で検証する。Daily Missionは参加中Campaignの公開済み商品情報・ルール・素材だけを生成Contextへ渡し、保存前に広告安全Gateを通す。WebとLINEには安全なCampaign名と分類だけを表示し、参加撤回・グループ退出・商品割当解除後は新規生成と通知を停止する。

### G6: 安全検証

グループ類似検査、生成・招待制限、監査、KPIを実装し、1社・1商品・10〜22人・30〜60日で検証する。

基盤実装済み。本文を企業管理画面へ表示せず、正規化したSHA-256 fingerprintと64-bit SimHashだけを保存してCampaign内の類似企画を生成時に停止する。参加人数上限、1参加者あたりの生成上限、類似度閾値、Campaign中止をサーバー側で強制する。管理画面には集計値と先行テスト準備状況だけを表示する。実際の1社・1商品・10〜22人・30〜60日の検証は運用開始後に行う。

### G7: 承認型人格学習

先行テスト後にLearning Proposal、本人承認、取消、復元、学習前後KPIを実装する。

### G6-I: グループ限定SNS画像生成パイロット

特定Groupの先行テストでは、Daily Missionの`IMAGE`投稿から文字入り完成画像を生成する限定実験を追加できる。FREE一般ユーザーへ開放せず、Group参加同意、Campaign参加、商品割当、広告安全Gate、利用上限を生成開始時とJob実行直前に再検証する。

画像生成は人物・背景素材をProvider Adapterで作り、正確な日本語文字を管理テンプレートで合成する。LINEからはDaily Mission確認画面へ移動するだけとし、自動生成・自動投稿を行わない。所有権、予算、Storage、削除、管理者の可視範囲、Go / No-Goは`docs/GROUP_SNS_IMAGE_GENERATION_REBASELINE.md`を正本とする。

## 5. G1の設計判断

- Workspace Membershipは契約組織へのアクセス、Group Membershipは組織内の参加単位として分離する。
- GroupはOrganization Workspaceだけに作成でき、作成・招待はWorkspace OWNER / ADMINに限定する。
- 招待tokenの平文は保存せず、hashだけ保存する。
- 招待には有効期限、最大利用回数、利用回数、失効状態を持たせる。
- 参加時に`consentedAt`を必須記録する。辞退理由は必須にしない。
- 退出は履歴を削除せず`REVOKED`にし、以後の新規生成利用を禁止できる状態にする。
- 異なるWorkspaceのtoken探索結果は`NOT_FOUND`として扱い、存在を漏らさない。

## 6. G1完了条件

- Group / Membership / InvitationのMigrationがある。
- 同一Group・UserのMembershipは1件である。
- 参加同意、辞退、退出を別状態として保持できる。
- Workspaceを越えた招待利用・一覧取得ができない。
- 期限切れ・使用済み・停止Groupの招待を利用できない。
- schema validate、typecheck、lint、test、buildが成功する。

## 7. G2へ進む条件

G1のMigration・Isolation・同意構造を人間レビューし、Product Packの初期対象業種、同時ACTIVE数、商品関連投稿の監査範囲を確定する。
