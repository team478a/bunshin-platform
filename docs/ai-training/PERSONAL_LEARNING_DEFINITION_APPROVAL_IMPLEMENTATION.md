# Personal Learning Definition人間承認・撤回・監査

## 基準と今回のゴール

基準main `094f83668b4a283290de4ec66daec0268af5f4fa`（P1-G #1154）。branch `feat/personal-learning-definition-approval`。commit/PR/CIは本報告を含むPRの最終headを参照する。[ADR](ADR_PERSONAL_LEARNING_DEFINITION_APPROVAL.md)に判断を記録した。

Pilot Readiness [#1153](https://github.com/team478a/bunshin-platform/pull/1153)のG3「承認管理操作不足」だけを解消する独立実装。実際の教育レビュー・承認登録・staging準備・Profile初期化・Pilot開始は未実施。G3をPASSEDにしない。

## 構成とAPI

- 既存`LearningDefinitionApproval`がService/固定版の現在状態正本。`ProgramAuditLog`は追記する操作履歴。新table/schema/migrationなし。
- DB Repositoryは既存Package公開入口の固定3Definitionと既存Mission Qualityを読み、review digestを生成する。Package固有内容を共通Coreへ移動しない。新Provider/モデル/教材/Definitionなし。
- `GET /api/services/{serviceSlug}/ai-training/definition-approvals`: 自Serviceの3Definition、Mission、Router rule version、レビュー指紋、現在状態、revisionを返す。参照は承認ではない。キャッシュ不可。
- 同URLの`POST`: APPROVEまたはDEPRECATEを1件だけ実行。管理画面・bulk・自動承認・seedなし。長文レビュー本文ではなく、アクセス制限されたレビュー記録の短い証跡キーを使う。
- Webは既存session / managed Service resolver / POST Same Origin。Workspace/Service/actorはサーバーで解決し、クライアント指定を拒否する。
- `PERSONAL_LEARNING_DEFINITION_ADMIN=true`かつ非productionでのみAPIを使用可能。既定無効。Pilot flagとは独立し、Pilotを停止したまま準備できる。本PRでは設定しない。
- DBでもACTIVE User / Workspace / Service、同ServiceのACTIVE SERVICE_OWNER / SERVICE_ADMINを再照合する。参加者・別Tenant・失効権限は拒否し、再送時にも再認可する。

## 人間による操作手順（未実行）

対象staging、接続DB、採用SHA、実行者の権限、レビュー記録の保持先を別承認する。API利用を可能にする環境設定も別操作。productionをstagingと偽装しない。

1. 認証済み管理者がGETし、exact Definition key/version、Mission/Rubric、prerequisite、Safety、Completion Ruleを固定SHAで教育レビューする。3件を一括承認しない。
2. APPROVEには`operationId`（新UUID）、`definitionKey` / `version`、GETの`expectedRevision` / `reviewDigest`、`reviewedCommitSha`（40桁lowercase）、`reviewEvidenceKey`（80文字以内の記録キー）、`confirmation=CONFIRM_DEFINITION_APPROVAL`を指定する。
3. `reviewChecklist`のobjective / prerequisites / concepts / safety / mistakes / practice / rubricAndMissionを本人がすべて確認する。自動true補完は禁止。未レビュー項目があれば承認しない。
4. DBが指紋・revisionを再計算し一致した場合だけ保存する。`approvedAt`と`approvedByUserId`はサーバー側で設定する。本人申告のcommitと証跡キーを自動レビューの証明として扱わない。
5. HTTP 409ならGETと教育レビューをやり直し、新しい操作UUIDで明示確認する。送信内容不明の再送は同じUUID・同じ内容で行う。receiptの`stateAtOperation`は現在状態ではないため、結果確認はGETする。
6. 撤回は最新GETと新操作UUID、同じ参照/指紋/証跡/commit、`action=DEPRECATE` / `confirmation=CONFIRM_DEFINITION_WITHDRAWAL`を指定する。checklistは送らない。元承認者・時刻を保持し、撤回の実行者と時刻は監査へ記録する。
7. 再承認も新しいレビュー・最新revision・新操作UUIDを要する。過去Planの版固定履歴は変更しない。撤回以前に送信済みのProvider呼出しを取り消せるとは主張しない。

## CAS / 冪等性 / Audit

Serializable transactionでService行を排他lockし、管理者関連行をshared lockする。存在しない承認行への競合も直列化し、既存学習側の承認shared lockと整合させる。競合DBエラーは409へ変換し、人間確認なしの自動retryをしない。

revisionは現在状態・最後の操作ID・監査件数から算出する。同じmillisecondで承認→撤回→再承認して状態が同一でも古いrevisionは通らない。参照scopeごとの確定IDを既存監査のresourceIdに使用し、metadataへexact参照を記録する。

操作UUIDを監査のprimary keyに利用する。既存IDはscope/actor/action/正規化した操作fingerprintを照合し、同じ内容だけ当時のreceiptを返す。別操作・別ServiceへのID流用は拒否する。再送から撤回を取り消さない。状態変更と操作監査は同transactionで成功する。

`LEARNING_DEFINITION_APPROVAL_CHANGED`のbeforeDataに以前の状態/revision、afterDataに参照・操作・レビュー指紋/項目・申告commit/証跡キー・確認後状態を保存する。操作実行者・時刻は専用列。既存監査行を更新/削除する実装はない。運用者はService/参照resourceIdで既存監査を照会する。append-onlyは本Repositoryの動作であり、DB管理者の改ざん防止を保証するものではない。

## Privacy / 既存挙動 / 検証

相談、回答、教材個別生成、レビュー長文、業務秘密、Provider responseを保存しない。証跡キーへ秘密/個人本文を入れない。公開API/本人画面へ管理情報を出さず、エラーで入力本文を返さない。既存30日V1・Enrollment・Goal・Plan・LINE・Assessment・Providerを変更しない。

APIテスト: 認証、Origin、本番/flag拒否、Service scope解決、GET非更新、明示確認、偽装/余分field、409、本文上限、query拒否。DB単体: 確認項目・Privacy・安定fingerprint入力。隔離CI DB統合: 未承認からの承認、時刻/本人、同一再送、内容衝突、指紋/版不一致、stale CAS、撤回、再承認/ABA、越境/失効権限、同時初回承認の一件化。P1-A〜Gと既存Runtime回帰は最終headのCIで検証し、最終結果はPRに記録する。

## 残条件とrollback

実認証staging操作、教育レビュー・実承認、監査運用、Migration状態確認、Profile初期化、Pilot受入Flow A〜J、価格/費用上限、開始責任者は未完了。#1153 RunbookがまだOPENなら文書の人間レビューも必要。本実装完了を開始承認にしない。

rollbackは管理flagを停止してAPI操作を止める。コードrevertしても承認状態・操作監査・過去Planは残す。既に登録した承認をrevertで撤回したとは扱わず、必要なら先に明示撤回し、新規学習停止/保留Job確認を別実行承認する。table DROP・履歴削除・自動seedなし。本PRで実操作はない。
