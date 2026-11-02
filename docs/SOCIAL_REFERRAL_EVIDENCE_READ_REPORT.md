# B3 紹介資格の本人証拠取得

日付: 2026-11-02  
基点: main `8fcf1181`（#1430マージ後）

## 1. 調査

AGENTS、正本仕様、Architecture Principles、Decision Log、Roadmap、B3の境界・保存先監査、
既存の利用実績・読取認可・登録監査writer・SQL fixtureを確認した。
ServiceReferral、GroupMembershipAuditLog、既存SNS履歴を正本に使い、追加保存を行わない。

## 2. 変更

- Applicationの`service-referral-registration-evidence.ts`: 登録監査のscope・本人・時刻・action・reason・before/afterを照合する純粋投影。
- Applicationの`member-usage.ts`: 既存の重複排除を内部関数へ抽出し、集計と証拠投影が同じ結果を利用する。既存summaryの意味・形式は維持。
- SOCIALの`service-referral-evidence.ts`: 本人の会員scope Portと、既存利用履歴から資格用活動へのbinding。生成起動元の選択はSOCIALで行う。
- Databaseの`member-usage-repository.ts`: 既存クエリ本体を同一package内のtransaction用関数へ抽出。SQL条件や取得列を複製せず再利用する。
- Databaseの`social-service-referral-evidence.ts`: 新しい本人限定の読取Adapter。現時点ではHTTP / Jobから未接続。
- Application / SOCIAL / Databaseのunitと、新SQL結合10件を追加。

## 3. 境界・設計

[ADR](adr/SOCIAL_REFERRAL_EVIDENCE_READ_ADR.md)を参照。
actorUserIdと被紹介会員userIdの一致を必須とし、管理者や紹介者が他人を指定する代替権限を持たせない。
同Workspace / Serviceの本人所有・非ARCHIVEDなBunshinだけを対象とする。
各Bunshinで現在の所属・同意・所有権を再検証し、全取得をREAD ONLY / RepeatableReadの単一transactionで行う。
現在の所有集合を読むもので、過去に所有していたBunshinや譲渡・削除済み履歴の復元ではない。
所有Bunshinがなければ架空のBunshinを作らずnullを返す。

利用履歴の採否・投稿報告の重複排除は既存summaryと共有する。
本文・画像・Memoryを取得せず、ID・scope・実操作時刻・種別だけを資格へ渡す。
同じ日の複数Bunshinは、既存資格評価器が暦日unionで扱う。
起動元不明は別の不明証拠として保持し、定期・システム・失敗生成を本人操作へ読み替えない。
既存Usageの原価メタデータ照会も再利用されるが、資格証拠の返却値には原価を含めない。

登録監査の正本から、既存public-registration writerの完全一致の場合だけ新規/既存を判断する。
欠測・複数一致・異なるwriter形状はnull。日時一致だけでtrueにせず、
REGISTRATION_COMPLETEDやMembership作成日時の差から推測しない。
監査ログの発生元署名・writer版を追加するものではなく、既存writer契約に依存する。
上限は20 Bunshin / 100監査 / 既存source上限 / 合計10,000活動。
超過・欠損はPARTIALとし、無かったことにして0や達成へ変換しない。

一意性は既存ServiceReferralのDB制約による。
審査は未保存のため必ずUNKNOWNにする。これにより読取だけでQUALIFIEDにはならない。
初期設定日時は既存のServiceReferral.onboardingCompletedAtを利用し、
現在のプロフィールの完成度やSNS公開の公式証明へ意味を拡張しない。
資格の確定・件数・特典・Credit・Entitlement・外部操作へは接続しない。
紹介制度やHassyの無効設定を変更しない。

## 4. 検証

- Application全体150ファイル1,126件成功。
- SOCIAL全体31ファイル374件成功。
- Databaseの新Adapterと既存Usage unitを実行。
- 使い捨てPostgreSQLで新SQL10件＋既存Usage21件、計31件成功。残り282件はこのローカル実行では選択対象外。
- 型検査、変更箇所lint、format、architecture check、git diff --checkを実行し、全体の最終結果は最新HEAD CI verify / databaseへ記録する。

SQLは同じ本人の複数Bunshin、他会員の除外、登録監査の欠損/矛盾、
他Service / Workspace / Membership、失効・所有権変更、書込み無しを含む。
既存制約に合わせ、fixtureのidempotencyKeyと退会日時を補正して再実行した。
本番DBへ接続していない。ローカルDBは固定loopback・専用ラベル・専用DB名と
markerで検証し、既存migrationだけを適用した。実行後に対象containerを照合して削除済み。

## 5. 共有ファイルの変更

各packageのsrc/index.tsへ公開exportを末尾に追加。
database.integration.test.tsは新suiteのimportと登録の2行追加のみ。
schema / migration、環境変数定義・cron・依存・UI/APIに変更なし。

## 6. 未解決・次の条件

本人専用Portであり、他ユーザーを処理するJob認可を実装したものではない。
Jobからactorを対象ユーザーへすり替えて流用しない。
資格Policy版、審査・確定・取消の保存、非遡及・原価上限・特典付与との接続、
Hassy有効化は後続の保存設計・実装で扱う。validReferralsはnullのまま。

次は既存ServiceReferralに結び付く最小保存案を確定する。
既存データから復元できる登録イベントを二重保存しない。
最新HEADのCI verify / database成功とレビュー・マージが次の作業の条件。
本番反映は未実施。
