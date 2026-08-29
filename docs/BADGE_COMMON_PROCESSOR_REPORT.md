# 共通バッジ判定基盤 実装報告

## ゴール

B-2として、承認済みの初期10バッジを版付き定義として登録し、既存の客観的な行動記録から進捗と獲得を冪等に反映できるCoreを追加した。

## 実装範囲

- `FIRST`、`STREAK_DAILY`、`STREAK_WEEKLY`の判定
- 初期10バッジの再実行可能なCatalog登録
- Bunshin作成、戦略承認、企画確認、採用、投稿、振り返り、画像完了の候補取得
- 利用者の地域時間による日付判定、月曜日開始の週判定
- `BadgeProcessingEvent`による再送・再試行の冪等化
- WorkspaceとUserを固定した対象限定のProgress再計算
- 旧`AchievementBadge`から意味が一致する「初回確認」と「初投稿」のみの一度限り移行

## 安全境界

- 元イベントのWorkspaceとUser所有権を処理時に再検証する。
- 停止User、停止Workspace、所有者が異なるイベントは付与しない。
- 根拠は種類、ID、SHA-256 Hashだけを保持し、投稿本文、Personality、Knowledge、Memoryを複製しない。
- 全バッジを`rewardPolicy = NONE`、`visibilityPolicy = PRIVATE`で開始する。
- 不連続な「3日活動」は「3日連続」と同義でないため自動移行しない。

## 対象外

- 利用者API・画面
- Group独自バッジ
- Point・画像専用特典
- LINE・アプリ内通知
- PUBLIC公開、ランキング、AI品質採点

## 次のPhase

B-3で本人限定の獲得済み・挑戦中・次のおすすめAPIとモバイルUIを追加する。
