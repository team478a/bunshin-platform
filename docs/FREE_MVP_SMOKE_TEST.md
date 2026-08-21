# FREE SOCIAL MVP 本番スモークテスト

## 実行前

1. 対象のProduction commit、実行者、開始日時を記録する。
2. テスト専用メールアドレスと、他ユーザー境界確認用の第二アカウントを用意する。
3. Production migration、`/api/health/live`、`/api/health/ready`の成功を確認する。
4. ブラウザのNetwork/ConsoleとVercel logsを開く。Secretや本文を記録へ貼らない。

## 正常系ジャーニー

1. Magic Linkで登録・ログインする。
2. Bunshinを1体作成し、目的・対象者・人格を保存する。
3. 必要ならKnowledgeを作成し、そのBunshinだけへGrantする。
4. SOCIAL Capabilityを有効化する。
5. Primary Social Profileを1件作成する。
6. Account Strategy Wizardを完了し、生成結果を承認する。
7. Content Pillarを作成・有効化する。
8. 当週のWeekly Planを生成し、確認・確定する。
9. 今日のDaily Missionを生成し、内容を開く。
10. 「採用する」を押し、formatに応じたCopy操作を実行する。
11. 「投稿しました」を押し、GOOD / NEUTRAL / BADを1件保存する。
12. 再読込後もDecision、Posted、Feedbackが表示されることを確認する。

## 分岐確認

- 別Missionで「今回は使わない」を選び、不採用理由をワンタップで保存する。
- OTHERだけ任意詳細を保存できることを確認する。
- 採用前にはCopyと「投稿しました」が表示されないことを確認する。
- 同日Missionを再生成し、追加AI生成なしで409相当の案内になることを確認する。
- 操作中は対象ボタンが無効になり、多重送信されないことを確認する。

## Isolation / Security

- User BからUser AのWorkspace/Bunshin URLへアクセスし404を確認する。
- Bunshin AのMission IDをBunshin Bのpathへ入れ替え、404を確認する。
- SOCIALを停止し、readは可能だがDecision/Copy/Posted/Feedback mutationが拒否されることを確認する。
- responseとlogにemail、cookie、token、Knowledge本文、生成本文、設定値が出ないことを確認する。

## Mobile

- 390×844相当で、横スクロールなしに今日のMissionへ到達できる。
- 採用・不採用・Copy・投稿完了・Feedbackを片手操作できる。
- loading、error、disabled、選択済みFeedbackが視覚的・音声読み上げ上判別できる。

## 終了判定

失敗した項目ごとにrequest ID、時刻、route、期待値、実結果を記録する。個人情報や本文は記録しない。重大なIsolation、保存不整合、秘密情報露出、migration不整合が1件でもあればNo-Goとする。
