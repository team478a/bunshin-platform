# AI研修 過去の未確定終了日時の個別確定

## 1. 調査した内容

main `89a3c8c6`（#1004マージ後）を基準に、保持期限Preflight/実行、終了日時Trigger、受講Lifecycle/共通排他、管理画面、Program監査と関連テストを確認した。過去の終了/取消は終了日保留となり、既存画面に入力手段がなかった。通常管理一覧はACTIVE/SUSPENDED Programと参加者が中心で、アーカイブ/退会後の歴史的受講は表示されない場合がある。

## 2. 変更したファイル

- capability-training/end-date-confirmation.tsと公開入口: 未確定一覧、候補Preview、確認Revision付き確定の契約。
- database/training-end-date-confirmation.tsと公開入口: Service管理者の再認可、個別所有/Module検証、候補の期限影響、受講ロック・Serializable・未確定CAS・最小監査・同一操作再送。
- Service別`/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/end-date`: same-origin、本人Session、厳格JSON、4096byte上限、Scopeのサーバー解決、Preview/Confirm。
- training-end-date-cardと既存Lifecycle Card: 日本時間の日時入力、証跡の根拠/理由、Preview、未チェックの明示確認、変更/競合時の再確認、通信失敗時の同一Operation ID再送。
- 保持期限Page/loader: 集計とは別の未確定受講一覧と個別操作。アーカイブProgram・退会参加者も含む。氏名表示用のdisplayName/Program名/受講ID以外の学習情報・emailは一覧に取得しない。
- Unit/HTTP/UI/Page/実DB統合テスト、D-146、ロードマップ、機能不足監査、本報告書。

## 3. 主要な設計判断

対象は自ServiceのAI_TRAINING_V1、終了/取消/期限終了済み、所有関係が有効で終了日時が未確定の1受講。管理者はACTIVEなSERVICE_OWNER/ADMINと本人・Group・Workspaceの状態を同じTransactionで再確認する。一般参加者、CONTENT_EDITOR、失効管理者、別Workspace/Service/受講/Moduleは拒否する。Programや参加者の現役状態は過去記録の確定条件にしない。

既存記録・EXPIREDの既知予定終了日時・保持期限処理済み印は上書きしない。管理者が証跡を確認し、未来でなく既知開始日時以後の終了日時を指定する。開始が不明でも自動補完せず、指定日時と理由だけを使う。予定期間や契約から終了日を推定しない。入力は端末のtimezoneに依存せず日本時間からUTCへ変換し、存在しない日付を拒否する。

Preview RevisionはVersion・Scope・操作者・対象本人/所属・受講状態/更新時刻・保持期限状態・候補日時・理由・90日/暦年1年の期限判定を束ねる。保持期限を跨いだ確認や候補変更も再確認する。共通受講ロックを取り、再開や期限処理と競合させない。未確定終了日時のみ保存し、同一Transactionで操作者・日時・理由・Operation ID・確認RevisionのProgram監査を残す。理由に個人情報・回答本文を入れないよう画面で案内する。受講状態・予定期間・Job・回答・評価・仕事情報・点数・Toolkit・契約は変更しない。

同じ操作者・Operation ID・入力の再送は、確定済み日時と受講Revisionが一致するときだけALREADY_APPLIED。再開/別期間へ移った後に古い操作を再送しても日付を復元しない。CAS失敗とSerializable競合は409、未知DB障害は成功へ置換せず伝播する。

未確定対象100受講/1000Programを超えた一覧は部分表示せず拒否する。所有境界不明は操作へ出さず、一覧0件を全保留解消の証拠としない。集計は従来どおり読み取り専用で、日時確定は別セクションの明示操作とする。

## 4. 実行した検証

- ローカルDatabase関連4ファイル64件、Web関連5ファイル55件が成功。変更ファイルlint、architecture check、`git diff --check`も成功。最終型確認と全体CIは下記の対象HEADの結果を参照する。

- Unitで個別Scope・Role・Module・日時妥当性・既存記録維持・Revision変更・確定/監査順序・未確定CAS・再送/再開後拒否・DB例外・一覧上限/所有境界を検証。
- HTTP/UI/Pageで認証/Origin/Scope差替え/JSON上限、PreviewとConfirm分離、日本時間と不正日付、初期空入力と未確認、取得障害/認可失効/上限の案内を検証。
- 実DBの既存研修Fixtureを拡張し、未確定の過去受講のPreview、アーカイブ/退会後の一覧、失効/CONTENT_EDITOR/別Scope/別Module拒否、2件並行確定が一度だけ保存/監査、再送、学習本文/Toolkit/受講期間の維持、Preflight保留解消、再開Triggerによるリセットと古い確認の拒否を検証する。
- 全体format/typecheck/lint/test/build、隔離PostgreSQLのDB validate/migration/readiness/統合テストの最終結果は対象HEADのCIとPR検証欄を正とする。ローカルで本番DBやProviderを使用しない。

## 5. 未解決事項

本番Migration/設定変更、実データ補完、保持期限処理の停止解除、削除、Cron登録、AI/LINE呼出、課金/返金は行わない。既存schemaを使うためmigration追加は不要。確定日時の訂正・再補完、一括確定、証跡ファイルのupload、対象100件超のページ分割は非対象。事実確認は運営管理者の責任であり、証跡不明なら保留を維持する。理由の自由文は監査のために保持されるため、学習本文や機微情報を入力しない。

## 6. 次へ進める条件

最新HEADの全体CIと実DB検証、人間レビュー後にマージ可能。サービス管理の「AI研修の進み具合」または「研修データの保持期限を確認」から個別操作する。確定は保持期限起算日を設定するだけで、削除実行の承認ではない。本番の期限処理有効化には対象件数/起算日、本人Export、停止・復旧、証跡を別途確認して承認する。
