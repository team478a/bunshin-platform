# ハッシー Photo First Missionなし開始 実装報告

更新日: 2026-10-01（Asia/Tokyo）
基準: `main` commit `d1629db0f3a6233a5e2649fc321169160ec72a5d`

## 1. 結論

今日のDaily Missionがまだ作成されていなくても、確定済みWeekly Planに今日の予定があり、そのPlanに対応するACTIVEなSNSプロフィールがある場合は、保存済み写真からPhoto Firstを開始できるようにした。

新しいMission生成経路は追加していない。既存の`DailyMissionGenerationService`を`existingPolicy: RETURN`で呼び、既存Missionがあれば再利用し、なければ既存のWeekly Plan・承認済みStrategy・Content Pillar・Goal・履歴・利用枠・品質検査を通して今日のMissionを作成する。そのMission IDを既存のPhoto First投稿案生成へ渡す。

## 2. 利用者フロー

1. 確定済みWeekly Planに今日の予定がある。
2. 今日のMissionが未作成でも、READYな本人所有写真へ「この写真から投稿を考える」を表示する。
3. ボタンを押すと、サーバーで本人・Service・Workspace・Bunshinを再検証する。
4. リクエスト日が保存済み通知設定のタイムゾーン上の今日であることを確認する。
5. 既存Missionがあれば再利用し、なければ既存Mission生成サービスで作成する。
6. 解決したMission IDを既存Photo First生成サービスへ渡す。
7. 同じ画面で続けて別写真を使う場合は、解決済みのMission IDを再利用する。

## 3. 設計判断

- Weekly Planがない日に写真だけから独立したMissionを作らない。
- 承認済みStrategyやGoalを迂回するPhoto First専用企画経路を作らない。
- Mission作成には既存のWorkspace、Service、User、Bunshin、SOCIAL Capability境界を使う。
- 同日・同一BunshinのMissionは既存DB一意制約と`existingPolicy: RETURN`で再利用する。
- Mission生成の商用利用記録はMission IDを含む固定キーで記録し、Photo Firstの再クリックで同じMission分を重複記録しない。
- 日付とSNSプロフィールをクライアントだけで信用せず、タイムゾーンは保存済み通知設定から解決し、Mission生成時にWeekly PlanとACTIVEプロフィールの整合を既存サービスで再確認する。

## 4. 変更範囲

- Photo First HTTP入力に、既存Mission IDまたは今日のMission作成Contextのどちらかを許可。
- 確定済みWeekly PlanとACTIVEプロフィールから、サーバー描画時に最小のMission作成Contextを組み立てる。
- 今日のMissionが未作成でも条件を満たす写真に開始ボタンを表示。
- 初回生成後はレスポンスのMission IDを画面状態へ保持。
- Mission生成、Photo First生成、利用記録の接続テストを追加。

DB schema、migration、依存関係、Provider設定は変更しない。

## 5. 失敗時の扱い

- Weekly Plan、承認済みStrategy、Content Pillar、ACTIVEプロフィールが不足する場合は既存生成サービスが拒否し、Photo First生成へ進まない。
- Mission生成が失敗した場合、写真や既存Plan First投稿案は削除しない。
- Mission生成後にPhoto Firstが失敗した場合、作成済みMissionは残し、次回はそのMissionを再利用できる。
- 過去日・未来日をMissionなし開始Contextとして送った場合は拒否する。

## 6. 検証範囲

自動テストでは次を確認する。

- 既存Mission IDがある場合は従来経路を維持する。
- Mission IDがない場合は今日の日付、タイムゾーン、プロフィール、本人Scopeを既存Mission生成へ渡す。
- Mission生成結果のIDをPhoto Firstへ渡す。
- Mission ID単位の商用利用記録を行う。
- 今日以外の日付ではMission生成、Photo First、利用記録を実行しない。
- Mission未作成でも、確定済みWeekly PlanとACTIVEプロフィールがあれば開始ボタンを表示する。

実OpenAI、実Storage、本番DB、LINE、SNS投稿、本番デプロイは実施しない。

## 7. 未確認事項

- 実Providerを用いた長時間のMission生成とPhoto First連続実行のスマートフォン体感時間。
- Mission生成成功後にHTTP接続が失われた場合の画面上の案内。
- 本番のWeekly Plan配信時刻と利用者が写真を選ぶ時刻が競合した場合の実運用挙動。

## 8. 次の最小タスク

本PRとPhoto First履歴永続化PRの両方がマージされた後、スマートフォン幅で「Missionあり」「MissionなしだがPlanあり」「Planなし」の3状態を、課金Providerを使わないE2E fixtureで確認する。
