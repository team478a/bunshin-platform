# EVO-05-A: 本人再現Evidenceの最小契約

- 状態: Proposed（実装PRレビュー対象）。本番利用承認ではない。
- 基準main: `3ecd3c6bf1063bfb1cc5ab338cec14437d480f40`（#1192）。
- 参照: #1188監査のEVO-05/M2、Learning First V2 Target Model、V2-A実装報告。

## 判断

EVO-05を分割し、最初はマナベルスタイルの3Definitionについて、異なる題材・異なるAssignmentでの再実践を比較する純粋Package契約だけを追加する。ハッシーの同母数効果比較は別PR。汎用Learning Coreへの移動、DB/API/UI接続は行わない。

既存Guided Practice完了契約、支援量、Learner Scope、Definition参照、Skill Rule版を再利用する。提出Promptの評価と本人申告は別根拠。両者が揃っても外部AI操作、完成品品質、自力習得、Capability Level、Goal達成を確定しない。

比較対象は同一Scope/Goal/Plan revision/Definition版、異なるAssignment/Answer、後時点の完了。題材は固定された合成練習カテゴリのみ。カテゴリが異なることは意味的な転移の証明ではない。両方の版付きPASS評価と完了EvidenceがなければUNKNOWN。支援量の減少は観測値であって自動支援変更の命令ではない。

関数は認可済みRepositoryからの投影を想定するが、現在は未接続。入力のverifiedはクライアントから信用できる証明ではない。将来接続時は現行認可、最新Plan、Definition承認、Answerと評価監査一致、hint/helpによる実支援量、保持/削除を再確認する。既存Pilot/Provider/V1/LINE Gateを迂回しない。

## 不採用・延期

1回のSELF_REVISEDをLevel 4にする規則、自己申告のみの再現認定、同一Assignment再送の再成功扱い、成果物本文収集、新Definition、Teaching生成、保存・集計・画面追加は行わない。純粋契約の合成テスト成功は実ユーザーの再現性やAIモデル品質の保証ではない。
