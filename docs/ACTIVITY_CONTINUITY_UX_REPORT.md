# Phase 7-J2 活動継続UX 実装報告

## 範囲

- 分身詳細の最上部に今週の残り回数を表示
- 月曜日から日曜日までの7日カレンダーを表示
- 今日のMissionへ「確認しました」「今日は休む」を追加
- 保存後はActivityから進捗を再構築して画面へ反映
- 累積の活動日数を表示

## UX方針

- スマートフォンで最初に今日の操作が見える配置とする
- Mission lifecycle、採用判断、コピー、投稿完了とは別のActivityとして扱う
- 「今日は休む」は失敗や減点として表示しない
- 英語の内部状態をユーザーへ表示しない
- 週間目標の初期値は3回とし、達成後は肯定的な文言へ切り替える

## Isolation

画面の進捗はJ1の`GetMissionProgress`を使用する。Workspace、User、Bunshin、ACTIVE SOCIAL Capabilityを検証し、Group由来Missionでは現在のGroup所属とCampaign参加も再検証する。

## 含めていないもの

- バッジと発信ステップ
- 休眠判定と復帰通知
- Group Manager向け集計
- 目標回数を変更する管理画面

これらはJ3以降で独立実装する。
