# ワタシワークス マルチサービス基盤 再設計方針

## 1. 目的

プロジェクト名とリポジトリ名は`bunshin`を維持する。表示上の共通基盤名は「ワタシワークス」とする。

ワタシワークスは一般ユーザーへ単一サービスを直接提供するブランドではなく、目的や対象者ごとに独立した発信支援サービスを開設できる共通基盤とする。第一号は自社運営の副業・アフィリエイト向けサービスとするが、サービス名をコードへ固定しない。

## 2. 採用する内部構造

既存`Group.id`を、初期の`service_id`相当として使用する。Groupと並行する別のService識別子を追加して二重管理しない。

```text
User（共通ユーザー）
└── GroupMembership（サービス参加情報）
    └── Group（内部的なサービス境界）
        ├── ServiceConfiguration
        ├── ServiceBrand
        ├── ServiceRegistrationPolicy
        ├── ServiceLegalDocument
        └── サービス固有データ
```

コード内の既存Groupモデルは段階移行のため維持する。利用者・導入企業向けUIでは「グループ」を原則表示せず、用途に応じて「サービス」「公式プログラム」「発信プログラム」「アンバサダープログラム」「活動プログラム」を使う。

## 3. 既存実装の評価

### 実装済みで流用するもの

- 共通User、認証Identity、Workspace Membership
- Group、Group Membership、招待、参加同意
- Platform AdminとGroup Manager
- Group単位の機能許可、参加者別割当、利用上限、監査
- 商品パック、Campaign、広告安全ルール
- PDF・動画・URL・テキストを扱うGroup Knowledge
- 外部成果計測URL
- Group専用LINE設定と暗号化済み秘密情報
- Group単位の画像・動画生成
- ポイント・バッジの処理基盤
- 各種監査ログ

### 部分実装

- Groupは独立した業務境界だが、名称と状態以外のサービス設定がない。
- Group専用LINEは存在するが、サービス別通知テンプレートとリッチメニューは未完成である。
- 複数Group参加は可能だが、専用URL・専用画面・専用ブランドへ分離されていない。
- 権限はMANAGERとPARTICIPANTが中心で、コンテンツ担当者を表現できない。
- ポイント取引とバッジの一部はGroupを記録するが、残高・進捗・付与の一意性がWorkspace中心である。

### 未実装

- サービスslug、ブランド、公開方式、運営者情報
- サービス別オンボーディング、アンケート、法務文書、問い合わせ先
- 公開登録、招待限定、参加承認、登録経路、紹介元
- サービス運営者向けの契約・請求
- OEM、独自ドメイン
- 第一号サービスの設定データ

## 4. テナント境界

新しいサービス機能では`workspaceId + groupId`をサービス境界の正本とする。URLのslugやクライアントから渡されたIDだけを信用しない。

次の処理はすべてサーバー側でACTIVEなWorkspace、Group、Group Membershipを再検証する。

- API
- Server Component / Action
- LINE Callback / Webhook
- AI生成
- 画像・動画生成
- Background Job / Cron
- 管理画面
- レポート・CSV出力

サービス管理者向け取得は、他サービスの件数・名称・存在も返さない。Platform Adminのみ全サービスを扱える。

## 5. サービス分離が必要な既存データ

次のデータは現在WorkspaceまたはBunshinを中心に管理されているため、サービス利用時に`groupId`相当を直接または改変不能な親関係から必ず確定できるようにする。

- Bunshinと投稿人格設定
- Social Profile、Account Strategy、Content Pillar
- Weekly Plan、Daily Mission、Mission Content
- Decision、Activity、Post Record、Feedback
- Knowledge Grant、Memory、Generation Context
- AI利用履歴、画像・動画生成履歴
- LINE通知設定・配信履歴
- Job
- Point Account、Redemption、Processing Event
- Badge Progress、Award、Reward、Notification

新しいサービス経由で作成するレコードはサービス境界を必須とする。既存の個人データへ機械的にGroupを割り当てない。

## 6. 共通ユーザーと同意

`User.id`を共通ユーザーIDとして維持する。サービス参加情報は`GroupMembership.id`を`service_membership_id`相当として扱う。

ログインIdentityを共通化しても、次の情報をサービス間で自動共有しない。

- サービス内プロフィール
- 投稿人格、個人メモリー
- 投稿・生成・分析履歴
- ポイント、バッジ、特典
- 商品・投稿URL
- 権限、課金状況

氏名、表示名、連絡先、LINE連携、基本プロフィール、SNSアカウントを再利用する場合は、共有する項目、提供元サービス、提供先サービス、同意日時、取消日時を記録する。

## 7. ブランドとURL

サービスごとに、少なくとも次を設定可能にする。

- サービス名、説明、運営者情報
- ロゴ、アイコン、ファビコン
- 主色、副色、表示フォント
- Powered by ワタシワークス表示
- 公開状態、利用期間
- 利用規約、プライバシーポリシー、問い合わせ先

初期URLは`/s/{serviceSlug}`を正規入口とする。slug解決後も必ずGroup IDとMembershipをサーバー側で検証する。独自ドメインはPhase 4まで実装しない。

## 8. 登録と認証

サービスごとに次の登録方式を選択できるようにする。

- `PUBLIC`: 公開登録
- `INVITATION_ONLY`: 招待限定
- `APPROVAL_REQUIRED`: 登録後に管理者承認
- `CLOSED`: 新規受付停止

登録経路、招待コード、紹介元、同意履歴、参加・退会履歴を保存する。サービス専用LINE、メール、LIFFは入口を分離するが、最終的なUserは既存Userへ安全に関連付ける。

## 9. LINE

既存の共通LINE／Group専用LINE切替をサービス単位へ昇格する。

- ワタシワークス共通LINE
- サービス専用LINE
- 企業独自LINE
- OEM専用LINE

Channel Secret、Access Token等は既存暗号化方式を再利用し、平文再表示を禁止する。LINE設定、接続、Webhook、通知テンプレート、配信停止、Rich Menuをすべて`workspaceId + groupId + environment`で分離する。

## 10. 権限

サービス内の業務ロールは次を基本とする。

- `SERVICE_OWNER`: 契約・管理者・全設定
- `SERVICE_ADMIN`: 参加者・運用・ブランド・配信
- `CONTENT_EDITOR`: コンテンツ・商品・配信予約・分析
- `PARTICIPANT`: 本人機能

既存GroupRoleは互換のため直ちに削除しない。最初はMANAGERをOWNER/ADMINへ移行できるようにし、具体的な機能利用可否は既存Feature Definition / Policy / Assignmentを継続利用する。

## 11. ポイントとバッジ

ポイントはサービス間で移転しない。Point Accountを`workspaceId + groupId + userId`単位へ移行し、交換・失効・返却も同じ境界を必須にする。

バッジは共通定義を再利用できるが、Progress、Award、Reward、Visibility、Notificationはサービス参加単位で分離する。同じUserが同じ共通バッジを複数サービスで獲得できる一意制約に変更する。

## 12. 課金境界

Phase 1〜3では決済を実装しない。サービス契約、費用負担者、利用上限、機能Entitlementを保持できる設計だけを準備する。

- サービス運営者負担
- 一般ユーザー負担
- 混合負担
- 無料試験

実請求、従量課金、独自ドメイン、OEM請求はPhase 4で別途設計する。

## 13. 段階移行

1. Groupを内部サービス境界としてDecisionへ固定する。
2. 追加テーブルでサービス設定・ブランド・登録方針を導入する。
3. 新しいサービスURLとサーバー側Service Contextを導入する。
4. 既存主要データへnullableなGroup参照を追加する。
5. 安全に特定できる既存Group由来データだけをbackfillする。
6. 新規サービスフローではGroup参照を必須にする。
7. 第一号サービスだけをFeature Flagで有効化する。
8. 実運用確認後に企業テンプレートへ展開する。
9. 必要な列を後続MigrationでNOT NULL化する。

既存の個人向けデータ、Memory、通常投稿をサービスへ自動移行しない。

## 14. 実装フェーズ

### MS-1: Service Foundation

- Service Configuration / Brand / Registration Policy
- service slugと`/s/{serviceSlug}`
- Service Contextとfail-closed認可
- サービス別法務文書と同意
- サービス内ロール
- 既存Group管理画面の表示名変更

### MS-2: Service Data Isolation

- Bunshin / SOCIAL / Mission / Generation / Jobのサービス分離
- Point Account / Redemptionのサービス分離
- Badge Progress / Award / Rewardのサービス分離
- LINE Rich Menu / Templateのサービス分離
- Cross-service isolation test

### MS-3: 副業・アフィリエイト向けサービス

- Platform Adminによるサービス作成
- 独自ブランド、公開登録、オンボーディング
- 専用LINE、コンテンツ、投稿URL、実績
- ポイント、バッジ、機能上限
- Powered by ワタシワークス
- 結果保証・誇大表現を拒否する安全ルール

### MS-4: 企業向けテンプレート

- 招待限定サービス作成
- 企業ブランド、企業LINE、OEM基礎
- 商品・活動・公式Knowledge
- コンテンツ担当者と承認ルール
- サービス別実績レポート

### MS-5: 課金・OEM

- サービス運営者課金
- 人数・AI・画像・動画の従量課金
- 独自ドメイン
- OEMと請求管理

## 15. 必須テスト

- Service Aの管理者がService Bを一覧・取得・更新できない。
- 同じUserが複数Serviceへ参加できる。
- 人格、Memory、Mission、投稿履歴が混ざらない。
- LINE接続・通知・Rich Menuが別Serviceへ流れない。
- Point残高、交換、Badge進捗・特典が混ざらない。
- AI・画像・動画の利用量がService別に集計される。
- JobにService Contextがない場合は実行を停止する。
- PUBLIC、INVITATION_ONLY、APPROVAL_REQUIRED、CLOSEDが正しく働く。
- 停止・期限切れServiceへ登録・生成・通知できない。
- Service別規約の版更新時に再同意を求める。
- Platform AdminだけがServiceを横断管理できる。
- 従来の個人向けデータをService Adminへ公開しない。

## 16. 今回実装しないもの

- サービス間一斉広告
- 企業案件マーケット、応募、選考、マッチング
- ユーザーの企業間共有
- 複数サービス投稿の統合画面
- 成果報酬精算、インフルエンサー報酬管理
- 共通ポイントのサービス間移転
- 独自ドメイン、実請求

## 17. 完了条件

- 複数サービスを作成し、名称・ブランド・登録URL・LINEを分離できる。
- 共通Userが複数サービスへ参加できる。
- Service Adminは自サービスだけを管理できる。
- 人格、投稿、生成、Point、Badge、通知が混ざらない。
- 第一号サービスを独立ブランドで運用できる。
- 企業が自社参加者を招待して運用できる。
- 既存個人機能を壊さず段階移行できる。
- 管理操作をサービス別監査ログで追跡できる。
