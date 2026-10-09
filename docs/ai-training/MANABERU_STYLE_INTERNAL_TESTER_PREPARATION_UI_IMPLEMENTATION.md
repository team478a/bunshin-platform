# マナベルスタイル 内部テスター準備UI

## 基準・範囲

- 基準main: `8bbfd229596e2c7b7861d3601aae7aedcd7fc460`（#1184）。
- branch: `codex/manaberu-internal-tester-preparation`。最終commit / PR / CIはGitとPR checksを正本とする。
- 既存専用Program作成UIへ、停止中のSERVICE_OWNER本人を内部テスターとして準備する操作を追加。原checkoutの未解決変更は触らない。
- 実装・合成検証と本番反映を区別する。本PRで本番設定変更、登録、Definition承認、START、課金呼出し、deployは実施しない。

## 操作導線

`/s/{serviceSlug}/manage/programs/personal-learning-preparation`

1. 「本人の準備状態を確認」。認証済み本人のMembership・専用Programの適格Offering・本人Enrollment・本人Seatをserverで解決する。他参加者の名簿/Seat・email・Profileは返さない。
2. policy未設定の場合だけ、内部上限1人または2人を人間が選ぶ。初期値は未選択。外部累計上限100、Wave 0、外部受付0を表示して確認し、`CONFIGURE`する。既存policyをこのUIから上書きしない。
3. 再確認後、本人の無料・招待制・GUIDED・期限なしEnrollmentを`PREPARE_ENROLLMENT`。Offeringが複数適格または不明なら選択を推測せず停止。
4. 再確認後、本人Enrollmentへ`ADMIT kind=INTERNAL`。外部100人枠を消費しない。取消済み/異種Seat、inactive/期限付きEnrollment、Wave 0以外、内部上限1〜2以外は停止する。
5. 再確認で現在の本人Enrollmentとlive INTERNAL Seatが読めた場合だけ、既存本人学習準備画面へのリンクを表示。本人がProfileを回答する。準備完了をPilot開始・Definition承認・実課金許可としない。

各操作は独立した人間確認・reviewEvidenceKeyが必要。前のチェック状態を次操作へ流用しない。証跡キーは100文字以内の識別子であり、秘密情報・相談本文を入力しない。

## API / 認可 / 正本

- 新規は`GET /api/services/{serviceSlug}/ai-training/internal-preparation`の限定projectionのみ。queryによるUser/Program/Enrollment指定を拒否。POSTなし、private/no-store。
- 実session、管理Service resolver、server固定authority、両実行flag OFF、operations/participant preparation flagを要求。既存Repositoryの停止中・専用Program・通知隔離認可を再利用し、非同期読取後も環境条件を再確認する。
- 本人Membershipはworkspace/group/user完全一致かつACTIVE SERVICE_OWNERに限定。Enrollment/Offeringは同workspace/group/programに限定する。個人情報・他参加者Seatを返さない。role変更や追加Membershipを作らない。
- 書込は既存`pilot-operations` / `pilot-participants`だけ。既存Origin/JSONサイズ/strict入力、DB内再認可、lock、CAS、idempotency、cap、auditを変更しない。GETの表示情報は実行許可の代わりにならない。
- 初回CONFIGURE、本人Enrollment作成、INTERNAL Seat付与のみ。INITIALIZE/START/STOP/REVOKE、Wave拡大、EXTERNAL付与、Definition APPROVE、Profile代入、Goal/Plan作成はUIに設けない。

## 通信・再送

クリック連打はref lockで拒否。operation UUIDとbodyは送信前に保持する。5xx、通信失敗、receipt不正は結果不明とし、入力/状態更新/次段階を閉じ、同じbodyの明示再送だけを許可。CAS/認可等の4xxは状態再確認と人間再確認を要求し、自動retryしない。

receiptを確認した後も自動的に次操作を実行せず、改めて現在状態を読む。ページを離れると再送情報が失われることを表示し、reload後の新規操作連打を禁止する運用を維持する。

## 検証

- unit/HTTP: 初回未選択・未確認、bounded evidence、本人target参照、step遷移、稼働中/Wave/上限/失効/inactive拒否、不正receipt、同body再送、4xx、START非送信。
- server page: 未認証/別Service拒否、SERVICE_OWNER + flagだけ表示、SERVICE_ADMIN/CONTENT_EDITOR/PARTICIPANTは非表示。
- 読取API: query identity/POST拒否、scope filter、既存Repository拒否、環境変化後拒否、他Seat非返却、適格Offering不明/複数停止、本人Seat/Enrollment復元。
- e2eスキルを使用し、既存390×844ローカルharnessで合成HTTPのみを使用。3操作の独立確認、失敗時の同body再送、失効Seat拒否の3ケース成功。モデル/実Providerなし。
- ローカルNode 24: Web関連10ファイル107件成功（準備/参加者管理/Call Admission/LINE隔離を含む）。追加変更後の新UI/HTTP/ページ3ファイル29件も成功。既存学習画面7ケースを含むe2e計10ケース成功。
- Web typecheck、変更対象Web lint、learning-ui typecheck/lint、architecture checkを確認。全体Web lintは既存consentページのwarning以外に新clientの不要assertion2件を検出し、修正後に変更対象lintを再実行して成功。
- CIの全体format/typecheck/lint/test/build/e2eと隔離DB結果は最終PR checksを正本とする。CI未完をPASSとして扱わない。本番・実Provider・本番認証E2Eは検証していない。

## 非変更 / 残課題 / rollback

schema/migration、Provider、Assessment、Router、LINE/V1 Runtime、外部募集、Secrets、設定正本を変更しない。既存Program未初期化・人数設定不正・Offering複数などはこのUIで修復せず停止する。内部2人目の他User登録UI、承認UI、START UI、大規模管理画面は本PR対象外。

人間レビューとCI後も本番releaseを別指示・別Gateで選ぶ。mainには別OEM変更があるためmain全体を無断deployしない。実登録・本人Profile回答・Definition承認・Pilot START・実Provider・実認証E2Eは未実施。旧V1の実ユーザー操作を合成UI試験で代替しない。

コードrollbackは本PRのrevertを別レビューする。DB rollback不要。既存Seat/Enrollmentを削除しない。取消は累計枠を戻さず、学習停止・失効は既存trusted運用で別承認する。
