# EVO-05 題材レビュー認証済みHTTP入口（R3先行）

## 基準と範囲

- 基準main: `9e0db97a51b15cacd8e2c95f328cfabeff3d32ee`（#1199 merge、main CI成功）。
- branch: `codex/ai-evolution-evo05-challenge-review-http`。
- commit: 本報告を含むPR head。
- 既存レビュー資料・strict command・保存/取消Repositoryへのsession compositionのみ。管理UI・実人間レビュー・課題配信/R3 Runtime Bridgeは未実装。

## 再利用・認可

既存currentUserProviderによるsession本人、resolveManagedServiceContextのADMINISTRATION（SERVICE_OWNER/SERVICE_ADMIN）、requireSameOrigin、API error mapperを再利用する。認証actorをRepositoryへ渡す。クライアントからactor/Workspace/Service/Programを選ばせない。

Repositoryは各操作/再送で生きた管理者所属とWorkspace/Group/User、指定ProgramのSUSPENDED・Pilot OFF・通知OFF・allowlist整合をSerializable transactionで再検証する。HTTPのService認可だけでDB認可を省略しない。既存Group lock、CAS、UUID idempotency、取消後再送、append-only auditを変更しない。

## endpoint / 入力

`/api/services/{serviceSlug}/ai-training/challenge-review`（Node runtime）:

- GET: `?challengeKey={既存題材key}`のみ。重複/余分なqueryを拒否、query上限256文字。9件の既知合成fixtureからserverが完全版固定referenceを解決する。資料・digest・server commit・revision・記録判断・履歴を読むだけで保存しない。
- POST: 同一Origin、application/json、ストリーム実測4096 bytes以内、queryなし。#1199の厳格9-field command（operationId/reference/expectedRevision/materialDigest/reviewedCommitSha/evidenceKey/action/confirmation/checklist）を再利用する。APPROVE/REJECT/REVISION_REQUIRED/REVOKEを明示し、未知field・任意本文・actor・authorityを拒否する。
- 応答はprivate, no-store / nosniff。未認証401、準備条件・対象不一致404、Origin403、入力400、サイズ413、CAS等409、未知障害500。内部エラー本文を公開しない。

GETで返る資料はレビュー用の合成Draftであり、受講者向け教材APIではない。参照keyは`packages/capability-training/src/reproduction-challenge-fixtures.ts`を正本とする。GETのreference/digest/commit/revisionを確認し、POSTへ一致値を渡す。REVOKE時はchecklist=null、confirmation=CONFIRM_CHALLENGE_REVOKE。通常判断はCONFIRM_CHALLENGE_REVIEW。証跡keyは本文ではなくレビュー記録を識別する限定コードとする。

## server-owned設定 / commit

すべての環境で次を必要とする。今回設定しない。

- `PERSONAL_LEARNING_CHALLENGE_REVIEW_ADMIN=true`（専用flag、未設定は拒否）。
- `PERSONAL_LEARNING_PRODUCTION_PREPARATION`: 既存厳格authority JSON（workspaceId/groupId/serviceProgramId）。developmentでもscopeを省略しない。
- `PERSONAL_LEARNING_PILOT=false`かつ`PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT=false`を明示。未設定/不明をOFFとして推測しない。
- APP_ENV: production/staging/developmentのみ。
- `VERCEL_GIT_COMMIT_SHA`: 実行deploymentの小文字40桁SHA。既存Production Gateと同じdeployment metadata名を利用し、main/手入力body/git fallbackで補完しない。Vercel以外やローカルではtrusted起動側による対応SHAの供給が別途必要。実環境の設定正当性は今回未確認。

request開始時のenvironment/上記5設定を固定し、Service解決後、Repository transaction guard、応答前で変化を拒否する。書込後transaction guard失敗は既存Repositoryがrollbackする。commit後に応答前のflagが変わった場合、保存済み判断を取り消せるとは限らない（応答を拒否し、再読込/同UUID再送で照合）。別instanceへのflag伝播/送信済み処理取消を保証する仕組みではない。実行可否は引き続きlive DB Gateを必要とする。

START前にはレビューflagもfalseに戻す運用とする。今回START/STOP経路は変更しない。Programが稼働へ変わればRepositoryの停止中Gateがレビュー操作を拒否する。

## 実行許可・Privacy

全snapshotはexecutionPermission=NOT_GRANTED。APPROVE記録があっても9fixturesはDRAFT、R1 resolver/R2 projectionはUNKNOWNのまま。既存Definition承認とは別で、Assignment/Assessment/Provider/Pilotを起動しない。資料本文/相談/回答を監査へコピーせず、HTTPもpayloadをログに出さない。

## 検証

HTTPは合成session/ServiceとRepository mockを使う。strict commandはdatabaseの公開入口から実validatorを読み込む。全caseでfetch未呼出しを確認する。実DB認可・同時実行・rollbackは#1199の統合試験で検証され、本PRはRepositoryを変更しない。実browser/production session・実人間判断・production metadata正当性は未検証。

- 新規HTTP 22 cases + Origin/Service権限回帰: 3 files / 39 tests成功。
- 準備/Pilot操作の関連回帰: 4 files / 54 tests成功（追加2 cases前）。
- capability-training全体: 29 files / 465 tests成功。
- review admin Repository: 21 tests成功。本PRで実DB統合を再実行していない。
- architecture:checkと境界否定テスト10件成功。Web TypeScript成功。
- Web build成功（Prisma client generate / Next compile / TypeScript / static pages）。変更ファイルeslint / Prettier / diff check成功。
- Web全体最終: 465 files / 3,252 tests成功、既存2 files / 2 tests skipped。

初回HTTP testは公開databaseモジュールのlazy loadで5秒timeoutとなった。public validatorをbeforeAllで読み込み、各HTTP処理時間とは分離して再実行成功。lintのtype import/不要assertionは既存規約に合わせて修正。安全assertionのskipや本番ロジックの緩和は行わない。

Web全体初回は3,250 tests成功（追加2ケース前）。最終再実行をbuildと重ねた際、既存daily-missions/posting-partner-terminologyの3ケースが5秒timeoutとなった。build終了後に該当2 filesを1 workerで再実行し12 tests成功。タイムアウト値・既存test・assertionを変更せず、Web全体を単独再実行して3,252 tests成功。root全体と実DB統合の最終head検証はPR CIで確認する。

## 変更・未実装・rollback

変更はHTTP handler、Next route、HTTP unit test、Decision Log、本報告。schema/migration/Provider/モデル/LINE/OEM/既存学習仕様/本番環境変更なし。DB接続/実APPROVE/Pilot enable/deployを実行しない。

次は最小管理UIと実認証通し検証の別PR候補。その後も実人間レビュー、Runtime承認読取/取消反映、R3/R4は別レビュー。HTTP追加を本番利用開始の承認にしない。

rollbackはPR revertまたは専用flag OFF（実操作は別承認）。既存auditは削除しない。DB rollback不要。
