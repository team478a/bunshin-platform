# Production Closed Pilot: trusted準備API Gate

## 基準 / 範囲

- 基準main: `d2d31d744623935702e2ced3a9aa4749f2abc6ad`（#1160 merge確認）。
- branch: `feat/personal-learning-production-preparation`。
- commit / PR / CIは本報告を含むPR最終headを正本とする。
- RunbookのPR Bを分割し、Definition人間承認API / 本人Profile初期化APIの本番準備Gateだけを実装する。UI・参加者登録・人数上限は別作業。
- Production DB接続 / Migration / deploy / 設定変更 / Definition APPROVE / Profile登録 / Pilot enable / 実Provider呼出しは実施していない。合成test fixtureの保存を本番操作と混同しない。

## 新しいGate

既存機能別flag `PERSONAL_LEARNING_DEFINITION_ADMIN` または `PERSONAL_LEARNING_PROFILE_PREPARATION` を維持する。既定無効。本番ではさらに`PERSONAL_LEARNING_PRODUCTION_PREPARATION`が必須。

値はJSON objectで、`workspaceId` / `groupId` / `serviceProgramId` のlowercase UUID三つだけ。空欄・不正値・余分なfieldは拒否。scopeはserver設定でありrequest body / queryから受け取らない。今回実値や本番設定は作成しない。

本番準備中は`PERSONAL_LEARNING_PILOT`と`PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT`のどちらも`true`でないことを要求する。実行flagが片方でもtrueなら準備APIは閉じる。準備設定だけでPilot実行が有効になることはない。

非本番では従来の機能別flagと認可を維持する。未知environmentを非本番として許可しない。productionをstagingと偽装する手順は採用しない。

## 認可とProgram分離

既存session / Service resolver / POST Same Origin / strict command / request byte上限を再利用する。HTTPでService一致を確認し、非同期Service解決後・body読取後に設定を再確認する。設定取消・authority差替えは拒否。

Repositoryは既存認可・CAS・冪等性のtransaction内で以下を確認する。GETと同操作再送も例外にしない。

1. server指定Workspace / Service / Programが完全一致。
2. Programは`SUSPENDED`、`AI_TRAINING_V1`、Pilot disabled、通知と延期通知がdisabled。
3. 既存の重複なしUUID1〜5件allowlistを維持し、全参照Enrollmentが同Workspace / Service / Programへ実在する。
4. Service-owned承認の他Programへの波及を避け、同Serviceに別AI Training Programがあれば拒否する。終了/停止した別Programも除外せず保守的に拒否。
5. Profileは本人Enrollmentがserver指定Programに所属し、本人ACTIVE PARTICIPANT / 有効期間 / 削除後再作成禁止 / Goal・Assignmentなしを従来通り要求。
6. Definition管理はACTIVE SERVICE_OWNER / SERVICE_ADMINだけ。参加者を承認者へ昇格させない。

他Service/Packageの参照、旧V1 Programの転用、共有Service内の別研修の設定変更は行わない。専用Service/Programが実環境で存在することは未確認。存在しなければNO-GOとし、人間が登録方法・scopeを別レビューする。

## 既存正本とHuman Approval

Definitionは既存`LearningDefinitionApproval`、操作履歴は`ProgramAuditLog`。Profileは既存`TrainingParticipantProfile`、初期化履歴は既存Event。schema / migration / 新tableなし。

3固定版のreview digest、CAS revision、操作UUID、確認文、本人申告commit / 証跡キー、明示reviewChecklist、承認者・時刻を維持する。GETは承認でも保存でもない。AIがchecklistを埋めたりfixtureを昇格させたりしない。

Profileは本人がrole / aiLevel / dailyMinutesを明示する。UNKNOWNをBEGINNER / NONEへ補完しない。管理者の代入、旧30日V1 setup、Goal自動作成、Profile上書きはない。

API path / public request command / response shapeは変更しない。Repository第三引数にserver authorityを渡す構成のみ追加し、内部DB helperはpackage公開APIへ追加しない。

## 人間承認後の操作手順（今回は未実行）

1. 採用release SHA、Production DB Migration/readiness/RLS、backup、実session/認可/Privacy、対象Service/Program/Enrollment、停止・drain、操作責任者を確認する。
2. 固定authorityと機能別flagを対象release環境だけに設定する操作を別承認する。#1160のcall authorityと同じscopeを指定する。全instance / 別domain / 旧deploymentへの反映を確認する。
3. Pilot実行flag off、Program SUSPENDED / disabled、通知停止、既存Job drainを確認する。flag offだけで送信済み処理が終了したとはみなさない。
4. 認証済み人間管理者が既存GETとDefinition Review Sheetを使って教育レビューし、各版のAPPROVEを明示操作する。部分レビューや未承認をPASSで埋めない。API設定が有効でも自動承認しない。
5. 本人が自身の既存Profile APIで最小回答を明示確認する。session / credentialをAIや他人へコピーしない。最小本人UIは別PR。
6. GET・保存receipt・既存監査を対象scopeで確認し、準備flagとauthority設定を閉じる。Goal / Plan / Assignmentを準備APIから開始しない。
7. Definition承認 / 本人Profile完了だけでWave 0を開始しない。全Release Gateの実環境証拠と別開始承認を要求する。

承認撤回もこの準備APIでは停止状態を要求する。実行中Pilotの緊急撤回・即時drainを完成させた機構ではない。まず既存Kill Switchで新規実行を停止し、未終了call確認・Program停止の承認済み手順を用いる。このPRはKill Switch操作APIを追加しない。

## Privacy / 既存互換

相談・成果物・秘密情報・Provider responseを保存しない。既存の構造化Profileと確認証跡だけを再利用する。既存Export / ALL削除と再送認可を変更しない。

30日V1のUI / Runtime / Assignment / Assessment / LINE / Provider、Personal Learning Router、原価Telemetry、呼出しAdmissionを変更しない。本文・履歴の用途を拡張しない。

## テスト / 結果

- ローカルWeb: preparation access / Definition管理 / 本人Profileの3 files・48 tests成功。
- ローカルapplication: authority契約7 tests成功。
- 実DBケース追加: 固定Program、明示承認、本人所有、読取非更新、再送時の状態再認可、別authority、通知enable、foreign allowlist、共有Service拒否。
- 全体CI verify / database、architecture check、型・lintの最終結果は本PR headのChecksと完了報告に記録する。CIは使い捨てDBのみ。実環境成功を主張しない。

## 未実装 / 停止 / Rollback

UI、trusted参加者登録、累計100人Hard Cap、実環境Migration監査、全instance/実認証検証、実Definition承認、本人Profile登録、開始承認、金額上限・監視・未知call枠復旧は残る。Wave 0 NO-GOを維持する。

停止は準備authority設定を除去または各機能別flagをoffにする。既存承認・Profile・履歴は自動削除しない。設定反映・処理中transaction終了を確認する。旧コードは本番準備を拒否するが、schema rollbackは不要。実行flagで準備を停止するためにPilotをenableする運用は禁止する。

このPRで停止し、UI・人数上限・本番操作へ自動的に進まない。
