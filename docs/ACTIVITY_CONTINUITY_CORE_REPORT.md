# Phase 7-J1 活動継続Core 実装報告

## 範囲

- `MissionActivity`へ`CONFIRMED`と`RESTED`を追加
- 既存のActivity APIから冪等に記録できるHTTP contract
- Mission日付と本人のActivityから週間・累積進捗を派生する`GetMissionProgress`
- ACTIVE SOCIAL Capability、Workspace、User、Bunshinの検証
- Group由来Missionでは、ACTIVE Group所属とACCEPTED Campaign参加を取得時に再検証
- 週間目標の初期値3回と残り回数の計算

## 進捗状態

同じMission日に複数のActivityがある場合は、次の優先順位で表示状態を決める。

1. `POSTED`
2. `PREPARED`　— 形式別コピーが成功
3. `CONFIRMED`
4. `RESTED`
5. `UNSEEN`

`RESTED`は確認回数、準備回数、投稿回数に含めず、過去実績の減点や削除を行わない。

## 正本と再構築

進捗専用の正本tableは作成していない。`DailyMission.missionDate`とappend-only `MissionActivity`から毎回派生するため、集計値が失われてもRaw Eventから再計算できる。

## 含めていないもの

- ユーザー向け進捗API / UI
- 活動カレンダー
- バッジと発信ステップ
- 休眠判定とLINE復帰通知
- Group Manager向け集計

これらはJ2以降で独立実装する。
