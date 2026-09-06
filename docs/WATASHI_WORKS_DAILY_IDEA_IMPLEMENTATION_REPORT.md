# ワタシワークス公式「毎日の発信アイデア」実装報告

## 1. 調査した内容

既存のService、Group、Membership、Bunshin、SOCIAL、週間計画、Daily Mission、LINE通知、Knowledge、Commercial Setting、Mission Schedulerを確認した。既存の自動配信基盤を再利用できる一方、企業情報がUser共通プロフィールに寄っていること、業種が生成へ直接渡らないこと、配信頻度が利用者任せであること、Service単位のAI上限が実行時に適用されないこと、通知候補が1,000件で打ち切られることを確認した。

詳細な差分は`docs/WATASHI_WORKS_DAILY_IDEA_SERVICE_GAP_ANALYSIS.md`に記録した。

## 2. 変更したファイル

主な変更箇所は次のとおり。

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260907143000_add_service_member_business_profiles/migration.sql`
- `packages/database/src/index.ts`
- `packages/application/src/mission-automation-jobs.ts`
- `apps/web/src/services/service-creation-templates.ts`
- `apps/web/src/services/service-onboarding-settings.ts`
- `apps/web/src/services/service-generation-knowledge.ts`
- `apps/web/src/services/service-daily-idea-fallback.ts`
- `apps/web/src/organization-ai-generation-quota.ts`
- `apps/web/src/jobs/daily-mission-job-handler.ts`
- Service参加者のオンボーディング、ホーム、分身初回設定、運営設定画面
- 対応するWeb、Application、Databaseテスト

## 3. 主要な設計判断

### Serviceごとに事業情報を分離

企業プロフィールを`ServiceMemberBusinessProfile`として追加した。`workspaceId + groupId + groupMembershipId + userId`の複合外部キーにより、別Serviceや別利用者の情報を誤って生成へ渡せない構造にした。

保存項目は業種、その他業種、事業名、地域、商品・サービス、発信目的、対象顧客である。SNS、Timezone、通知時刻は既存のService内Social ProfileとLINE通知設定を正本として再利用する。

### 専用テンプレートから開始

サービス作成テンプレート`BUSINESS_DAILY_IDEAS`を追加した。初期値はLINE登録のみ、毎日8時、頻度固定、内容は発信アイデアである。運営設定画面で毎日・平日、時刻、頻度固定、アイデア・完成原稿を変更できる。

### 生成根拠へ企業プロフィールを接続

事業プロフィールを構造化Knowledgeへ変換し、投稿パートナー候補、週間計画、Daily Missionへ渡す。医療・福祉、士業、フィットネス、不動産には追加の安全指示を付け、効果保証、断定、資格判断、価格・物件条件等の未確認情報を避ける。

### AI障害時も配信経路を維持

Provider障害、品質拒否、内部生成失敗、AI上限到達時は、曜日で循環する安全な予備案を保存する。予備案も通常のDaily Missionとして扱うため、既存の通知同意、停止、Service境界、重複防止、LINE送信処理を通る。

### Service上限と大量配信

Service月間AI枠は外部AI呼び出し前に予約し、成功時に消費、失敗時に解放する。Organization上限も従来どおり併用する。参加者上限は新規参加のトランザクション内で確認する。SchedulerはIDカーソルで最大1,000件ずつ継続取得する。

## 4. 実行した検証

- Prisma Client生成
- Prisma Schema検証
- Web、Application、DatabaseのTypeScript型検査
- リポジトリ全体のlint
- リポジトリ全体のbuild
- 企業向けテンプレートと設定のテスト
- 企業プロフィールKnowledgeと業種別安全指示のテスト
- 障害時予備案のテスト
- Service・Organization AI枠の予約、消費、解放テスト
- SchedulerページングとDBカーソル取得のテスト
- Service Membership複合外部キーとService AI台帳のSchemaテスト
- 自動配信と初回設定画面の回帰テスト

## 5. 未解決事項

実装後も公開前の運用作業が残る。

- 本番DBへMigrationを適用する。
- 専用テンプレートからServiceを作り、和愛株式会社の運営者情報、利用規約、プライバシーポリシー、問い合わせ先、公式LINE設定を登録する。
- 実端末でLINE友だち追加、通知同意、7日間の自動生成・受信、停止、ブロック時の挙動を確認する。
- 業種別の文言は安全指示を実装済みだが、医療、士業等を公開対象にする場合は運営側で内容を審査する。
- 業種マスター管理、Serviceごとの表示業種、業種別KPI、祝日除外、複数店舗・複数担当者は初期公開後の機能とする。

## 6. 次Phaseへ進める条件

専用Serviceを非公開で作成し、運営者5人、一般参加者10人までの限定受信テストを行う。次を満たした後に公開範囲を広げる。

1. 別Service・別Membershipの企業情報とMissionが混ざらない。
2. 利用者の毎日の生成操作なしで、設定した対象日に1件届く。
3. 同一日・同一BunshinでMissionとLINE通知が重複しない。
4. AI障害とService上限到達時に予備案へ切り替わる。
5. 通知停止、退会、LINEブロック、Service停止が送信時にも反映される。
6. 運営画面でAI失敗、LINE失敗、滞留、利用量を確認できる。
