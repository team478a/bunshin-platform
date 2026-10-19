# マナベルスタイル 声かけN-1 実装報告

## 目的と範囲

PR-N-1として、AIを呼び出さない決まった文面のLINE声かけを実装しました。N-2のAI費用予約、AI文面生成、生成失敗時の切替は含みません。`learningNudges` は初期状態OFFで、本番のDB・Program設定・環境変数・フラグは変更していません。

## 同意V3の確認

研修同意の正本を `AI_TRAINING_EXTERNAL_AI_V3` に更新しました。既存の同意者はV3の版・文面digestが一致しないため、研修画面にある同意フォーム1つでV3を再確認します。V2の同意フォームを表示してからV3を表示する中間状態やV2経由の遷移はありません。V3に同意すると通常の参加状態へ進みます。

## 対象者と実行

毎日9:00（日本時間）に `/api/internal/ai-training/learning-nudges` を実行します。`CRON_SECRET` による認証を必須とし、対象は次をすべて満たす受講者です。

- AI研修Programが有効で、当該受講が `DYNAMIC_V1` の許可対象かつ `learningNudges=true`
- 有効な受講、参加者本人、有効な内部テスター席がある
- 現行のV3同意がある
- LINEが友だち状態で、通知同意があり、チャネル設定が有効・検証済み
- 声かけ停止中でなく、休止期間中でない

送信直前にも受講・参加席・Programと機能フラグ・V3同意・停止/休止・テーマ・LINE接続・通知同意・チャネル設定を再確認します。月間送信枠がProgram設定の低優先度停止閾値に達している場合は送信しません。LINE配信の冪等性キーは受講・判定日・状況に固定し、同一キーの同時実行はoutboxの一意制約と状態のcompare-and-setで1件に抑えます。タイムアウト後の再試行は同じLINE Retry-Keyを使います。

テーマが複数あるときは、利用日が新しい有効テーマを声かけ先にします。送信リンクにはそのテーマIDを付け、テーマの状態も送信直前に再確認します。

## 判定・頻度・利用者操作

判定ルールは `packages/capability-training/src/personal-learning-nudges.ts` にまとめ、東京時間9:00〜20:00、送信間隔48時間以上、7日間で最大2回に制限します。声かけを受け取るだけで学習記録や最終利用日は更新しません。受講者は研修画面から1週間・2週間・1か月の休止、停止、再開を操作できます。操作は受講・ユーザー・ワークスペース・サービスにスコープし、操作種別と時刻だけを記録します。

## N-1で使う固定文面

文面の作成にAIは呼び出さず、状況に対応する以下の固定文面だけをLINEへ送ります。文末に対象テーマの研修画面リンクを付けます。

- **休止明け（REST_RESUME）**：「お休み明けですね。無理のない範囲で、テーマの続きを一歩だけ進めてみませんか？」
- **つまずき（STUCK）**：「止まっていても大丈夫です。前回の練習を小さく分けて、できそうなところから一緒に見てみましょう。」
- **開始後に停滞（NEW_LEARNER_STALLED）**：「最初の一歩は小さくて大丈夫です。今気になっていることを一言だけ書くところから始めてみませんか？」
- **実践完了後（PRACTICE_COMPLETE）**：「ここまで取り組めましたね。次のテーマを考えるのも、少し休むのも、ご自身のペースで大丈夫です。」
- **利用が途切れた（RETURN_INACTIVE）**：「前回取り組んだところから、できそうな一歩だけ再開してみませんか？いつでもご自身のペースで大丈夫です。」
- **反応がない場合の終了（NO_RESPONSE）**：「このメッセージでいったん声かけを終えます。学びたいと思ったときは、いつでも戻ってこられます。」

## 操作・集計・プライバシー

送信outboxは `PersonalLearningLinePush` に保存し、配信状態・時刻・冪等性キーで照合できます。送信記録と受講者の停止/休止/再開は、本文を含まない `ProgramActionEvent` にも記録します。日次処理は送信・対象・スキップ数を構造化ログへ集計します。本文はoutboxの配信記録に限り保存し、研修画面の書き出しに含め、本人の一括削除および既存の保存期間cronの削除対象に追加しました。N-1声かけ本文は、決定6の本文保持期間（最後の利用から1年、または受講終了から90日）で扱います。停止/休止の設定は受講データの保存期限で削除されます。

## DB変更とリリース順

Migration `20261019100000_personal_learning_nudges` は、受講単位の停止/休止設定テーブル、`NUDGE`用途のPush outbox許可、一括削除/保持処理の検索用indexを追加します。既存データの破壊的変更はありません。本番反映時はmigrationをプログラムより先に適用し、`db:assert-ready` が通った後にコードを反映してください。Programの `learningNudges` はOFFのまま反映し、内部テスター用Programだけを別途承認後に有効化してください。本報告・PR作成による本番変更はありません。

## 検証

- `pnpm --filter web typecheck` — 成功
- `pnpm --filter @bunshin/database typecheck` — 成功
- `pnpm --filter web test -- ai-training-consent-flow.test.ts personal-learning-nudges-cron.test.ts` — 2ファイル、9テスト成功
- `pnpm --filter @bunshin/capability-training test -- personal-learning-nudges.test.ts personal-learning-pilot.test.ts` — 2ファイル、18テスト成功
- `pnpm --filter @bunshin/database test -- training-personal-data-deletion.test.ts training-personal-data-export.test.ts training-retention-execution.test.ts` — 3ファイル、23テスト成功
- DB統合テストには、操作スコープ、書き出し・一括削除、保存期間削除にN-1の記録を含めるケースを追加しました。実データベース統合実行は本番DBへ接続せず、Draft PRのCIで確認します。

## 未対応・次の段階

N-2で、本人入力を制限したAI文面生成、受講・状況・判定日をキーとした声かけ専用費用予約、実費精算、失敗時の固定文面切替を追加します。N-1のマージ後に別Draft PRとして着手します。
