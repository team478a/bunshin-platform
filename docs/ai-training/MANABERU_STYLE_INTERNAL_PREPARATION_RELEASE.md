# マナベルスタイル — 内部テスター準備UIの限定リリース

2026-10-09 JST。branch: `codex/manaberu-internal-preparation-release`。

## 固定基準

- Production基準: `5ffe86cf6f68e7ec1ec6b4ae0ef41630be70aa8c`（#1185）。
- Source: #1186のmain squash `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`のみ。
- Cherry-pick commit: `1078afda6ea20b217944e93461ed9c3e0c487f64`。
- Source PR verify / database CI: [37859976247](https://github.com/team478a/bunshin-platform/actions/runs/37859976247)成功。限定release CIの代替にはしない。
- Read-only確認時の正式URLは `https://www.watashi-works.com`、READY deploymentは `dpl_8EkL7nhbR3GKMWnFnJqpGxyKjfvZ`。反映直前に再確認する。

## 差分と検証

#1186の14ファイルのみをproduction基点へ取り込み、この報告を追加する。Decision Logは今回のDecisionだけを追加し、main固有のOEM Decisionを取り込まない。他の13ファイルはSourceと完全一致をgit diffで確認した。

内部テスター準備UIは、停止中Pilotについて所有者本人の状態を読み、確認操作ごとに既存trusted preparation APIを利用する。Enrollment / INTERNAL Seat準備、internalCap 1または2の明示選択に限定する。詳細は[実装報告](MANABERU_STYLE_INTERNAL_TESTER_PREPARATION_UI_IMPLEMENTATION.md)。このrelease作業では操作を実行しない。

基準productionとの比較でPrisma schema・全Migration・DB package・Vercel設定・root package.json・lockfileの差分なし。OEM機能、migration runner、Provider設定、LINE Schedulerを追加・変更しない。最新必要Migrationは既存 `20261008140000_learning_member_line_link`のまま。buildは `db:assert-ready` → Web buildで、自動Migrationしない。

releaseでWeb準備UI / HTTP / pageの29テスト、既存release guardの10テスト、architecture check、スマートフォン幅390pxの合成UIテスト10件が成功。新規報告のPrettier checkとgit diff checkも成功。実Providerを呼ばない。CIではformat / typecheck / lint / test / UI e2e / buildと隔離DBテストを確認する。本番の実認証・実学習・旧V1実ユーザー確認は別Gateであり、合成テストの成功で代替しない。

## 停止条件とRollback

PR baseは `production`、Draftで作成する。**productionへのマージはGit連携deployを開始するため、CI成功を本番反映の承認としない。今回merge / deployしない。**

本番DB接続・書込、Migration、設定変更、参加者登録、Profile代理回答、Definition承認、START / STOP、実Provider呼出しは実施しない。UI追加だけでPilotを開始しない。

別途本番反映承認後、現行Production SHA / alias、schema readiness、Pilot停止状態、CI、rollback対象を再確認したうえでDraft解除・mergeする。readiness失敗時は停止し、自動DB修正しない。

公開前はDraftのまま中止可能。公開後のApplication rollback対象は上記Production基準SHA / deployment。DB変更がないためDB rollbackは不要。既存学習データ・Enrollment・Seatを削除しない。
