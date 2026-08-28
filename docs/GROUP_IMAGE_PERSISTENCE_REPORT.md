# グループ限定SNS画像生成 I2-B 実装報告

## 1. 対象範囲

グループ限定SNS画像生成のPilot、参加者登録、生成Request、生成Mediaを永続化する。Provider実行、Storage操作、API、UI、LINE通知は含めない。

## 2. 追加データ

- `social_image_generation_pilots`: Group単位の版、期間、上限、モデル候補、品質、緊急停止を保持する。
- `social_image_pilot_enrollments`: Pilotと同意済みGroup Membershipを結び、取消を上書きせず保持する。
- `social_image_generation_requests`: Mission、Bunshin、参加者、Campaign、商品版、生成Context、レイアウト、状態、revisionを保持する。
- `social_image_generated_media`: Requestごとの非公開Storage Key、寸法、hash、採否状態を保持する。

## 3. DB保護

- Groupごとの使用中Pilotは最大1件。
- 同じWorkspace・Group・利用者のidempotency keyは最大1件とし、別Groupの同名keyを混同しない。
- 同一Missionの`DRAFT`、`QUEUED`、`GENERATING_ASSET`、`COMPOSING`は最大1件。
- 同一Missionで採用済みMediaは最大1件。
- Membership、Bunshin、Mission、Campaign、生成Context、Enrollmentは複合外部キーでWorkspace／Group／Bunshin境界を保護する。
- 完成画像は1080×1350px、hashは小文字16進64文字にDB制約で限定する。

## 4. Repository

作成前と取得・状態更新時に、GroupとMembershipの使用許可、参加同意、Pilot状態、期間、緊急停止を再検証する。Bunshin所有者、Mission形式、Campaignと商品版、生成Contextが一致しない場合は保存しない。状態更新は所有範囲、現在状態、revisionがすべて一致した1件だけを更新する。

## 5. Rollback手順

1. `SOCIAL.IMAGE_GENERATION`のGroup PolicyとMember Assignmentを無効化する。
2. 対象Pilotを`PAUSED`にし、`emergency_stop = true`として新規作成を停止する。
3. 既知正常なApplicationへcode rollbackする。追加tableは既存処理から参照されないため、履歴を残したまま安全に停止できる。
4. DB自体を戻す必要がある場合は、backupと必要な監査データを退避し、Media、Request、Enrollment、Pilotの順に削除するforward-fix migrationを別途作成する。
5. 最後に追加indexとenumを削除する。適用済みmigrationファイルは編集しない。

Migration適用後の単純なdown migrationを本番で直接実行しない。StorageとProvider接続は未実装のため、本I2-Bのrollbackで外部ファイルや課金処理は発生しない。

## 6. 次のPhase

I3で管理済みレイアウトschemaと5テンプレートを実装する。Satori／resvg／Sharp描画、非公開Storage、Provider接続はそれぞれ独立PRで進める。
