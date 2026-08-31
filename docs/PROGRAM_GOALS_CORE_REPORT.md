# 実践プログラム 支援方針・目標Core実装報告

## 今回のゴール

サービスが提供できる支援、利用者が欲しい支援、サービスが提示する目標候補、利用者個別の目標を混同せず、サービス境界内で保存できるようにする。

## 追加したデータ

- `ServiceProgramSupportPolicy`: 許可する支援方法、標準の支援方法、利用者選択の可否、案内文を版管理
- `ProgramMemberPreference`: 利用者が希望する支援方法と任意メモ
- `ProgramGoalDefinition`: サービスが用意する再利用可能な目標候補
- `ProgramMemberGoal`: 利用者個別の目標値、現在値、期間、状態

## 設計判断

- 支援方針は上書きせず版管理し、ACTIVE版はProgramごとに最大1件とする。
- 利用者の希望はEnrollmentと同じMembershipへ複合外部キーで拘束する。
- 個別目標は同じEnrollmentでACTIVEを最大1件とし、終了履歴を残す。
- 目標を`ACTION`、`TRAFFIC`、`BUSINESS`へ分け、行動と成果を別に評価できるようにする。
- 目標値は正数、進捗は0以上、終了日は開始日より後をDBでも検証する。

## Core検証

- 標準支援方法が許可一覧に含まれない設定を拒否
- Workspace・Service境界Keyを省略せずRepositoryへ渡す
- 0以下の目標値と不正な期間を拒否
- 複合外部キー、ACTIVE一意制約、Resource分離をSchemaテストで確認

## 次のPR

AV-3Bでサービス管理者向け支援方針・目標候補画面と、利用者向け希望・個別目標画面をAPIへ接続する。
