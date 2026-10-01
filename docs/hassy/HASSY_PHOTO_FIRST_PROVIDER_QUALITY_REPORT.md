# ハッシー Photo First 実Provider品質確認

更新日: 2026-10-01（Asia/Tokyo）

対象ブランチ: `codex/hassy-photo-first-differential`

実行開始時の基準main: `3e00a2ad289609d18adca98c804b15cadd1b9d90`

実行対象: PR #1053 のPhoto First差分検証コード

## 1. 結論

実OpenAI Providerを用いたGoal差分の品質確認は **未完了** である。承認された最大6リクエストのうち、最初の写真解析1リクエストがHTTP 429となり、Provider Adapterは`RATE_LIMIT`として失敗した。再試行禁止の条件に従い、その場で停止した。

したがって、実Providerについて認知と採用でテーマ、切り口、本文、写真案、CTAが変わるかは **INCONCLUSIVE** であり、fixtureによる契約検証の成功を実Provider品質の証明として扱わない。

## 2. 検証条件

- 実行日時: 2026-10-01 22:47 JST
- モデル設定: 環境に`OPENAI_MODEL`指定がなかったため既存Adapter既定値の`gpt-5.2`
- 認証: 既存の`OPENAI_API_KEY`をプロセス環境だけで使用。値は表示・保存・commitしていない
- 素材: ローカルでSVGから生成した架空のチェックリストJPEG
- 企業: `よりそう美容室（検証用架空店舗）`
- Goal: `BRAND_AWARENESS`、`RECRUIT`
- 同一条件: 写真bytes、企業、対象顧客、媒体、Mission、直近履歴
- 変更条件: SNS Goalと対応する`goalPlanning`だけ
- 外部送信予定: Goalごとに写真解析、本文生成、品質判定を各1回、計6回
- 再試行: なし
- 実ユーザー情報、本番DB、Storage、LINE、SNS: 使用なし

## 3. 実行結果

| 項目                | 結果                               |
| ------------------- | ---------------------------------- |
| HTTPリクエスト試行  | 1回                                |
| 成功した写真解析    | 0回                                |
| 成功した本文生成    | 0回                                |
| 成功した品質判定    | 0回                                |
| Adapterが返した分類 | `RATE_LIMIT`                       |
| HTTP status         | 429                                |
| 認知と採用の比較    | 未実行                             |
| 課金有無・使用token | 未確認（成功応答を取得していない） |

既存Adapterは429応答の詳細コードを外部へ返さず、`RATE_LIMIT`へ正規化する。この実行では応答本文を保存していなかったため、通常の一時的rate limit、API credit不足、組織の利用上限到達のどれかは確定できない。実際の二重送信や品質不良が発生した証拠ではない。

## 4. 判定

| 確認事項        | 判定                     | 根拠                                                                    |
| --------------- | ------------------------ | ----------------------------------------------------------------------- |
| 外部通信上限6回 | SAFE_WITHIN_TESTED_SCOPE | 1回目で停止し、2回目以降は送信していない                                |
| 再試行なし      | SAFE_WITHIN_TESTED_SCOPE | テスト・Adapterとも今回の実行内で再試行していない                       |
| 合成データのみ  | SAFE_WITHIN_TESTED_SCOPE | ローカル生成画像と架空企業だけを入力                                    |
| Goal差分品質    | INCONCLUSIVE             | 解析成功前に429で停止                                                   |
| 品質検査の合否  | INCONCLUSIVE             | 本文生成まで到達していない                                              |
| 100円相当の上限 | INCONCLUSIVE             | 成功token使用量とAPI請求情報を取得していない。ただし試行は1回だけで停止 |

## 5. 再実行手順

1. API PlatformのBillingとLimitsで、既存キーが属するProject/Organizationのcredit、spend limit、model accessを管理者が確認する。
2. 原因を解消後、同じ明示フラグを付けて次を1回だけ実行する。

```powershell
$env:RUN_OPENAI_PHOTO_FIRST_QUALITY='1'
pnpm --filter web exec vitest run test/photo-first-provider-quality.live.test.ts --reporter=verbose
```

テストは外部通信を6回に制限し、7回目を送信前に拒否する。通常の`pnpm --filter web test`ではlive testをskipし、CIや開発者端末から意図せず課金APIを呼ばない。次回は非2xx応答についてstatus、エラーcode/type、300文字以内のmessageだけを出し、資格情報やリクエスト本文は出力しない。

## 6. 合格条件

同じ合成写真・同じ企業条件でGoalだけを変え、以下をすべて確認できた場合に限り、この代表2 Goalのサンプル品質を合格とする。

- テーマ、切り口、推奨理由、本文、写真案、CTAが認知と採用で異なる
- 採用は働く人、仕事内容、職場、応募・見学等へテーマ自体が移る
- 認知は店舗の特徴、考え方、フォロー・保存等へつながる
- CTA末尾だけを変えた内容ではない
- 両案が既存品質判定を通る、または不合格理由をそのまま記録できる

この1サンプルが成功しても、全Goal・全業種、本番Storage、利用枠、AI Usage記録、スマートフォン表示、本番E2Eの証明にはならない。

## 7. 次の最小タスク

API Platformで今回の429がrate limit、credit不足、spend limit、権限のどれかを確認する。解消と再実行の承認後、同じテストを一度だけ再実行し、6応答のtoken数、出力、rubric判定を本書へ追記する。本番ロジックの変更は行わない。
