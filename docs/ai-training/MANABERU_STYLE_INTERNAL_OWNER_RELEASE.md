# マナベルスタイル — 所有者内部学習の限定リリース

2026-10-09 JST。branch: `codex/manaberu-internal-owner-release`。

## 固定基準・Read-only証拠

- 基準Production: `687fb3e4de8bab757e2eda4ce7d070a7bbf73739`（#1183）。
- source: mainの#1184 squash commit `8bbfd229596e2c7b7861d3601aae7aedcd7fc460`のみ。
- main CI [37840460205](https://github.com/team478a/bunshin-platform/actions/runs/37840460205)成功。限定release CIの代替とはしない。
- 2026-10-09 JSTのRead-only `vercel inspect https://www.watashi-works.com --scope team478as-projects`で正式URLがdeployment `dpl_6aq6BhC9VPTLbddBDnf8y7gVDzha`を指すことを確認。
- `vercel api /v13/deployments/dpl_6aq6BhC9VPTLbddBDnf8y7gVDzha --scope team478as-projects`のmetadataはtarget production、readyState READY、githubCommitRef production、githubCommitShaが上記基準SHA。秘密値を表示・保存しない。
- 本番DB接続/書込、設定変更、deploy、Definition承認、Seat付与、Profile回答、START/STOP、実Provider呼出しは未実施。

## 変更の限定

production基点へ#1184だけをcherry-pick。競合はDecision Logの先頭のみで、所有者内部学習のDecisionだけを追加し、main固有OEM Decisionを持ち込まない。DB公開入口のmergeは限定learner authority exportだけ。

同じSERVICE_OWNERが、自分の専用Pilot Enrollmentと有効INTERNAL/cohort INTERNAL Seatを持つ場合のみ本人学習へ進める。降格・二重Membership・全管理者の学習開放なし。詳細は[実装報告](MANABERU_STYLE_INTERNAL_OWNER_LEARNING_IMPLEMENTATION.md)。

基準productionとの比較で次は完全に不変:

- Prisma schema、全Migration、schema-readinessの要求版。
- `apps/web/vercel.json`、Migration runner、root package.json、lockfile。
- OEM課金/価格/cron、Provider設定、LINE Scheduler。

最新必要Migrationは既存 `20261008140000_learning_member_line_link`のまま。今回追加・適用なし。buildは `db:assert-ready` → Web buildで、自動Migrationしない。

## 検証と残Gate

`manaberu-scoped-release.test.ts`でOEM Migration/model/サービスの非混入、最新Migration一致、所有者の専用契約・INTERNAL Seatを検査する。`credential-rotation-release.test.ts`でread-only schema gate・自動Migrationなし・production-only Git設定を維持確認する。

限定releaseのverify（format/typecheck/lint/test/既存e2e学習画面/build）とdatabase（隔離PostgreSQL）両CIの成功をPR checksで確認する。実DB/スマートフォン/実Providerの本番E2Eを合成テストの成功で代替しない。旧export/delete等の所有者本人向け経路確認はPilot開始前の残Gate。

## Mergeの停止条件

PR baseは `production`。**Draftで作成する。productionへのマージはGit連携deployを開始するため、単なる文書レビュー・CI成功をdeploy承認としない。今回マージしない。**

1. 人間が限定差分とCIをレビューする。
2. Deploy直前にProduction基準SHA/aliasとschema readiness、停止中Pilot/開始Gate、rollback版を再確認する。今回のread-only deployment確認を将来の実環境状態へ流用しない。
3. 本番反映を別承認した後だけDraft解除・productionへマージする。Migration不要だがreadiness失敗なら停止し、DBを自動修正しない。
4. 公開SHA・health・既存V1/管理・Pilot停止状態を確認する。
5. trusted停止中PREPARE_ENROLLMENT/ADMIT INTERNAL、本人Profile回答、Definition承認、START/実課金はそれぞれ別の操作Gate。releaseだけで参加者を作成・開始しない。

## Rollback

公開前はDraftのまま中止可能。公開後は基準Production SHAへのApplication rollbackを別承認で行う。DB変更がないためDB rollbackは不要。学習データ・Membership・Seatを削除したり所有者を降格したりしない。
