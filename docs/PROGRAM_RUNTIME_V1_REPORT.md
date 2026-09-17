# Program Runtime V1 実装記録

## 調査した内容

Programの正本は既存の `ProgramTemplateVersion`、サービス採用は `ServiceProgram`、参加は `ProgramEnrollment` にある。既存のDaily Mission、投稿記録、成果記録、ポイント、バッジはそれぞれの機能の正本であり、Program Runtimeへ本文や残高を複製しない。

## 変更内容

### ProgramMissionAssignment

参加者へ提示した行動を記録する。Program Version、route、phase、mission definition、variant、既存機能の実行先、表示時点のスナップショットを固定する。Enrollment内の連番を一意にし、再実行による重複提示を防ぐ。

### ProgramActionEvent

行動事実を追記型で保存する。イベント種別、元になった既存リソース、発生日時、schema version、metadataを持つ。workspace・group内のidempotency keyを一意にし、Jobや通信の再送を1回の事実として扱う。

### ProgramProgressSnapshot

Enrollmentごとの現在route、phase、state、bottleneck、現在の行動、完了数を保存する。これはイベントから再計算可能なキャッシュであり、行動履歴の正本にはしない。更新ごとにrevisionを増やす。

## 主要な設計判断

- Enrollmentの参加状態と、ACTIVE・休眠等の行動状態を分離する。
- Assignmentの開始・完了・スキップとAction Eventの追加を同一トランザクションで行う。
- Daily Mission等との接続はresource type/idで行い、既存レコードを複製しない。
- Workspace、Group、Enrollment、Versionをすべて照合し、別サービスのデータを関連付けられないようにする。
- イベントは更新・削除を前提にせず、進捗はイベントから再構築できるようにする。
- 公開スキーマへ追加する3テーブルにはRLSを有効化する。

## 次のゴール

副業90日プログラムのEnrollment作成と既存利用者の移行方針を実装し、固定関数が使っている開始日を `ProgramEnrollment.startsAt` へ切り替える。その後、既存Daily Mission・今日の行動・成果報告をProgram Action Eventへ一度だけ投影する。
