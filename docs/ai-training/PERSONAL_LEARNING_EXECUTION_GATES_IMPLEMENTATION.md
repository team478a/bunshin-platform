# Personal Learning Closed Pilot: 実行・停止境界

基準main `3530d9628833c0edcab4e47ca5fede5a0adb9e80`（#1153）。branch `feat/personal-learning-execution-gates`。commit/PR/最終CIは本報告を含むPR head/Checksを参照する。[ADR](ADR_PERSONAL_LEARNING_EXECUTION_GATES.md)に判断を記録する。

## 本番Gate（設定は未実施）

既存 `PERSONAL_LEARNING_PILOT=true` は引き続き必要。本番だけ追加で `PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT=true` を要求する。既定は両方無効。専用ProgramのACTIVE/enabled、1〜5件UUID allowlist、通知停止、本人scope/期間等も必要であり、環境flagだけでは利用不可。一般公開flagではない。

Definition管理とProfile準備APIの本番拒否は維持する。本PRをdeploy/Pilot enable/Wave 0/実Provider利用承認としない。100人Hard Cap・費用Hard Stopが未実装のため開始NO-GOを維持する。

## Fresh Assessment Gate

`PrismaPersonalLearningAssessmentGate` は既存Pilot Persistenceのauthorized/Enrollment lock/Serializable/Program shared lock/本人認可/期間/削除拒否を再利用する。新table・正本・Providerなし。

Provider直前に本人PENDING Answer、同scopeの未実行Plan Assignment、現在の最新CONFIRMED Plan revision、唯一のACTIVE Primary Goal、Package固定3DefinitionとのMission/Plan対応、現在のAPPROVED Definitionと現在ACTIVE承認者を再検証する。revisionはAssignment snapshotと比較する。取消/失効/旧版/未確認/撤回を推測PASSにしない。拒否は非retryableでProviderへ送らない。検証後に環境flagも再読取する。

最初にPilotと認識した処理はrequirePilot=trueを保持し、待機中のmarker消失を旧V1許可に戻さない。Program markerが既に消えていてもAssignment.targetResourceType=PERSONAL_LEARNING_PLANならPilot扱いし、Providerへ送らない。旧V1 Assignmentは新gateを呼ばず、従来Provider/評価/Quota/再試行を維持する。

既存queueのflag/allowlist再検証とRouterの新Assignment生成gateは維持。新gateは評価実行の最後の認可であり、queue停止後の実行中fetchの取消機能ではない。認可transaction完了から外部fetch開始までには競合窓があり、停止操作が完了した瞬間に全外部呼出しを消せるとは保証しない。外部呼出し中のDB lock保持はしない。送信後の結果/usage保存とdrain確認は履歴・運用責務として残す。

## LINE分離

AI Training Action schedulerはmarker存在Programをenabled/malformed状態に関係なく候補読取前に除外する。既存broadcastの配信eligibilityでも予約ProgramまたはPlan参照Assignmentを拒否する。旧30日V1の非予約Action配信は継続する。これはPilotのLINE導線追加ではない。

## 検証

ローカル対象4ファイル27テスト成功。dual production flags、flag停止、旧V1維持、Provider前拒否、marker消失、Plan Assignment判定、scheduler除外、配信eligibilityを確認。

実PostgreSQL統合へ本人の現Plan/PENDING回答の認可成功、cross-user、Goal取消、Definition撤回、marker消失、Program停止、所属失効、Plan SUPERSEDED拒否を追加。既存P1-A〜G、Program/AI Training/LINE回帰、format/typecheck/lint/test/buildは最終CIを参照し、未成功の検証を成功としない。

変更: Webの環境/Provider直前gate、LINE scheduler/eligibilityとテスト、DBの新実行認可Repository/export/統合ケース、ADR/本報告/Runbook追記。schema/migration/UI/新Provider/価格/Quota/Definition内容は変更しない。

## 残条件・停止

本番操作なし。Gate C/D等の実環境判定はUNKNOWNのまま。人数・費用制約、本人準備UI、本番承認操作、Migration/Backup/RLS、実Auth、停止/drain rehearsalは後続別レビュー。

Program markerの恒久保持は運用前提。DB管理者がmarkerを直接消去し、学習参照も一切ない場合に過去予約Programを認識する永久台帳は存在しない。全Programの恒久予約/allowlist入替と累計参加枠は後続Hard Cap authority設計で扱う。本PRのmarker消失テストは認識済みworkerとPlan Assignmentに対する拒否であり、任意DB改変の完全防止と称しない。旧Runtimeへ戻す目的でmarkerを消す運用は禁止する。

rollbackは本番追加flagと既存Pilot flagを無効、専用Program SUSPENDED、保留Job/実行中Providerを確認してからコードを戻す。marker/Goal/Plan/Answer/Eventを削除しない。schema rollback不要。次の人数制御・費用・準備UIへ自動続行しない。
