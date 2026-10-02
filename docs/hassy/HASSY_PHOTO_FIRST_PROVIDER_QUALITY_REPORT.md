# ハッシー Photo First 実Provider品質確認

更新日: 2026-10-02（Asia/Tokyo）

対象ブランチ: `codex/hassy-photo-first-retention-sales`

実行開始時の基準main: `bd630b3a8d03075aafd5f36a05f8f2d68bb51d0c`

実行対象: mainへマージ済みのPR #1053・#1055に含まれるPhoto First実Provider検証コード

## 1. 結論

合成写真と架空企業だけを使い、実OpenAI Providerによる代表6 Goal（認知・採用・来店予約・問い合わせ・リピーター・販売）の差分検証を完了した。各実行では写真解析、本文生成、品質判定をGoalごとに各1回、合計6回に制限し、再試行は行っていない。

認知、採用、来店予約、問い合わせ、リピーターは、テーマ、読者価値、本文、写真の使い方、CTAが目的に応じて明確に変化した。リピーターでは、前回からの変化、同じ品質を再現するための確認、次回来店の目安へテーマが移った。

販売は既存checkerで92点・`PASS`になったものの、本文とCTAが初回来店の不安解消とDM相談へ寄り、前回の問い合わせ目的と近い。リピーターとの差はあるが、商品・サービス価値、比較、購入理由、商品閲覧・購入行動まで十分に分岐したとは判定しない。

既存checkerの結果は、認知92点、採用88点、来店予約92点、問い合わせ92点、リピーター90点、販売92点で、すべて`PASS`だった。ただし手動Goal評価では販売を`INCONCLUSIVE`とする。この結果は当該1写真・1架空業種・6 Goalの代表サンプルに限り、全Goal、全業種、本番運用の品質を証明しない。

## 2. 検証条件

- 実行日: 2026-10-01〜2026-10-02 JST
- モデル指定: `gpt-5.2`（Provider応答上の解決モデルは`gpt-5.2-2025-12-11`）
- 認証: `Stock Business LLC`の`Default project`に作成したRestricted keyを、git管理外のローカル`.env.local`からプロセス環境へ読み込んだ。キー値はログ、文書、commitへ記録していない
- API権限: Model capabilitiesの`Request`のみ
- キー有効期限: 2026-10-31
- 素材: ローカルでSVGから生成した架空のチェックリストJPEG
- 企業: `よりそう美容室（検証用架空店舗）`
- Goal: `BRAND_AWARENESS`、`RECRUIT`、`VISIT_RESERVATION`、`INQUIRY`、`REPEAT`、`SALES`
- 同一条件: 写真bytes、企業、対象顧客、媒体、Mission、直近履歴
- 変更条件: SNS Goalと対応する`goalPlanning`だけ
- 外部送信: 1回目は認知・採用、2回目は来店予約・問い合わせ、3回目はリピーター・販売。各回ともGoalごとに写真解析、本文生成、品質判定を各1回、計6回
- 再試行: なし
- 実ユーザー情報、本番DB、Storage、LINE、SNS: 使用なし

## 3. 実行結果

| 項目                   | 結果                   |
| ---------------------- | ---------------------- |
| 追加実行HTTPリクエスト | 6回（上限6回）         |
| 累計HTTPリクエスト     | 18回（6回×3実行）      |
| 写真解析               | 累計6/6成功            |
| 本文生成               | 累計6/6成功            |
| 品質判定               | 累計6/6成功            |
| 認知品質               | `PASS` / 92点          |
| 採用品質               | `PASS` / 88点          |
| 来店予約品質           | `PASS` / 92点          |
| 問い合わせ品質         | `PASS` / 92点          |
| リピーター品質         | `PASS` / 90点          |
| 販売品質（checker）    | `PASS` / 92点          |
| 販売Goal手動評価       | `INCONCLUSIVE`         |
| 追加実行token          | 入力14,878 / 出力2,817 |
| 累計token              | 入力44,648 / 出力8,640 |
| 追加テスト時間         | 52.41秒                |
| 再試行                 | 3実行とも0回           |

### Goal差分

| 比較項目 | 認知（`BRAND_AWARENESS`）                      | 採用（`RECRUIT`）                        |
| -------- | ---------------------------------------------- | ---------------------------------------- |
| テーマ   | 施術前の確認を大切にする美容室という特徴の想起 | 施術前の確認を大切にする職場と仕事の実像 |
| 切り口   | 相談しやすさを作る店舗の工夫                   | 確認・共有・施術という働き方と段取り     |
| CTA      | 投稿を保存して初来店前に見返す                 | 採用情報から見学相談を行う               |

| 比較項目 | 来店・予約（`VISIT_RESERVATION`）  | 問い合わせ（`INQUIRY`）            |
| -------- | ---------------------------------- | ---------------------------------- |
| テーマ   | 初回来店の流れと施術前のすり合わせ | 相談前の不安を減らす施術前FAQ      |
| 切り口   | 来店時に何を確認するかを段階表示   | 問い合わせ前の疑問へ質問形式で回答 |
| CTA      | プロフィールから空き状況を確認     | LINEで質問を送る                   |

| 比較項目 | リピーター（`REPEAT`）               | 販売（`SALES`）            |
| -------- | ------------------------------------ | -------------------------- |
| テーマ   | 次回も安心して任せるための施術前確認 | 初回来店時の施術前確認     |
| 切り口   | 前回の変化、再現性、次回来店時期     | ミスマッチ防止と相談の流れ |
| CTA      | 次回来店の目安を決める               | DMで初回相談を送る         |

リピーターは目的差が確認できた。販売はリピーターとの差はあるが、問い合わせGoalとの差が不十分である。既存checkerがこの内容を`PASS`にしたことも後続修正対象とする。

### Provider telemetry

| Goal       | 工程     | input tokens | output tokens |   latency |
| ---------- | -------- | -----------: | ------------: | --------: |
| 認知       | 写真解析 |        2,126 |           878 | 16,482 ms |
| 認知       | 本文生成 |        3,016 |           530 |  9,237 ms |
| 認知       | 品質判定 |        2,326 |            22 |  1,563 ms |
| 採用       | 写真解析 |        2,132 |           675 | 12,378 ms |
| 採用       | 本文生成 |        2,783 |           957 | 15,915 ms |
| 採用       | 品質判定 |        2,719 |            22 |  1,321 ms |
| 来店予約   | 写真解析 |        2,137 |           793 | 15,159 ms |
| 来店予約   | 本文生成 |        2,905 |           547 |  9,271 ms |
| 来店予約   | 品質判定 |        2,317 |            22 |    884 ms |
| 問い合わせ | 写真解析 |        2,127 |           636 | 11,513 ms |
| 問い合わせ | 本文生成 |        2,722 |           719 | 12,722 ms |
| 問い合わせ | 品質判定 |        2,460 |            22 |  1,017 ms |
| リピーター | 写真解析 |        2,132 |           755 | 13,480 ms |
| リピーター | 本文生成 |        2,911 |           662 | 11,733 ms |
| リピーター | 品質判定 |        2,479 |            22 |  2,445 ms |
| 販売       | 写真解析 |        2,118 |           655 | 11,165 ms |
| 販売       | 本文生成 |        2,764 |           701 | 12,364 ms |
| 販売       | 品質判定 |        2,474 |            22 |  1,110 ms |

## 4. 判定

| 確認事項        | 判定                     | 根拠                                                  |
| --------------- | ------------------------ | ----------------------------------------------------- |
| 外部通信上限6回 | SAFE_WITHIN_TESTED_SCOPE | 各実行とも実測6回で終了し、7回目はない                |
| 再試行なし      | SAFE_WITHIN_TESTED_SCOPE | 各工程を1回だけ実行                                   |
| 合成データのみ  | SAFE_WITHIN_TESTED_SCOPE | 架空画像と架空企業だけを入力                          |
| Goal差分品質    | INCONCLUSIVE             | 5 Goalは目的差を確認。販売は問い合わせとの差が不十分  |
| 品質検査        | RISK_REPRODUCED          | 販売固有性が弱い内容を既存checkerが92点・`PASS`と判定 |
| 本番E2E         | INCONCLUSIVE             | 本番DB、Storage、LINE、実ユーザー素材は対象外         |
| 全Goal・全業種  | INCONCLUSIVE             | 美容室1例、主要6 Goalだけを検証                       |
| 正確なAPI原価   | INCONCLUSIVE             | tokenは取得したが、請求画面の反映や単価計算は対象外   |

## 5. 実行コマンド

```powershell
$env:RUN_OPENAI_PHOTO_FIRST_QUALITY='1'
$env:PHOTO_FIRST_QUALITY_GOAL_PAIR='retention-sales'
pnpm --filter web exec vitest run test/photo-first-provider-quality.live.test.ts --reporter=verbose
```

結果:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    54.47s
Provider requests 6
```

このテストの成功は、2 Goal間の差と最低限のGoal語彙を確認したことを示す。既存checkerの販売判定が妥当であることは示さない。通常の`pnpm --filter web test`ではlive testをskipするため、明示フラグがないCIや開発者端末から課金APIを呼ばない。

## 6. 制約

- 代表1業種・6 Goalのサンプルであり、統計的な品質評価ではない
- 実際の店舗写真、曖昧な写真、複数写真、人物写真は未確認
- `TRUST_EXPERTISE`は未確認
- 販売は既存checker上の合格と手動Goal評価が一致していない
- 本番の利用枠予約・確定、AI Usage記録、Storage保存、LINE通知は未確認
- スマートフォン表示と利用者の採用・修正操作は未確認
- API請求額の反映は未確認

## 7. 次の最小タスク

販売Goalについて、本文とCTAが商品・サービス価値、購入理由、商品閲覧・購入等へ分岐せず問い合わせGoalへ寄った場合に`GOAL_MISMATCH`とする非課金の契約テストを先に追加する。その後、Promptとquality checkerの最小修正を別PRで行う。再度の実Provider検証は修正後に別承認を得てから行う。

### 後続実装状況（2026-10-02 JST）

- 問い合わせ型の本文・写真案へ販売CTAだけを付けた出力を不合格にする非課金の回帰テストを追加した
- 本文生成Promptを`mission-content-generator-v16-sales-goal-alignment`へ更新し、販売では具体的な商品・サービス価値、使用場面、比較、利用事例、購入理由のいずれかを本文と写真・動画案へ反映するよう明示した
- quality checkerを`mission-quality-checker-v12-sales-goal-alignment`へ更新し、一般的な初回来店不安、一般FAQ、対象を示さない相談だけの内容を販売として合格させない境界を明示した
- この時点では実Providerによる販売Goalの再検証は未実施であり、上記の`INCONCLUSIVE`および`RISK_REPRODUCED`判定は実測で更新していない

次の最小タスクは、別途課金承認を得たうえで、前回と同一の合成入力を使い、問い合わせと販売の2 Goalだけを実Providerで再比較することである。

## 8. Sales境界の実Provider再検証（2026-10-02 JST）

### 実行条件

- 対象branch: `codex/hassy-sales-provider-revalidation`
- 基準main: `8ea2c4eeb20cc3595a391878c872bb41242efc81`
- 実行日時: `2026-10-02 07:09 JST`（Provider結果のUTC: `2026-10-01T22:10:00.521Z`）
- Goal: `INQUIRY`、`SALES`
- モデル指定: `gpt-5.2`（Provider応答: `gpt-5.2-2025-12-11`）
- 入力: 前回と同一hashの合成JPEG、同一架空企業、同一対象顧客、同一Mission、同一直近履歴
- 写真SHA-256: `a1ea5282660ec7fa278aec26b11994b8a4fb1b9446be54558f4ad4d09e11f2b1`
- 外部通信: Goalごとに写真解析、本文生成、品質判定を各1回、合計6回
- 再試行: なし
- 実ユーザー情報、本番DB、Storage、LINE、SNS: 使用なし

### 実行結果

| 項目          | 問い合わせ（`INQUIRY`）                      | 販売（`SALES`）                                            |
| ------------- | -------------------------------------------- | ---------------------------------------------------------- |
| 主題          | 施術前確認を見える化し、相談ハードルを下げる | 施術前確認を判断材料として提示                             |
| CTA           | LINEで質問内容を整理                         | Instagram DMで初回相談                                     |
| checker       | `PASS` / 92点                                | `REVISE` / 78点                                            |
| checker issue | なし                                         | `GOAL_MISMATCH`                                            |
| Goal差        | 問い合わせとして一貫                         | CTA・本文とも一般相談寄りで、販売としては不十分            |
| 判定          | `SAFE_WITHIN_TESTED_SCOPE`                   | 生成: `RISK_REPRODUCED` / 検出: `SAFE_WITHIN_TESTED_SCOPE` |

販売の本文は、サービスの判断材料を含むよう改善した一方、テーマとCTAが「初回来店の不安解消」「DMで初回相談」に留まり、問い合わせGoalとの差が十分ではなかった。したがって、販売Goalの生成品質を合格とは判定しない。

quality checkerは、販売内容を以前の`PASS / 92点`から`REVISE / 78点`へ変更し、`GOAL_MISMATCH`として検出した。今回修正した「問い合わせ型Salesを誤合格させない」安全条件は、この1サンプルの範囲で達成した。ただしcheckerによる検出は、最初から販売向け内容を生成できることや、修正後の再生成が合格することを証明しない。

### Telemetry

| Goal       | 工程      | input tokens | output tokens |   latency |
| ---------- | --------- | -----------: | ------------: | --------: |
| 問い合わせ | 写真解析  |        2,127 |           685 | 11,191 ms |
| 問い合わせ | 本文生成  |        2,955 |           533 |  8,110 ms |
| 問い合わせ | 品質判定  |        2,430 |            22 |    853 ms |
| 販売       | 写真解析  |        2,118 |           843 | 12,420 ms |
| 販売       | 本文生成  |        3,145 |           594 |  8,613 ms |
| 販売       | 品質判定  |        2,525 |           343 |  5,005 ms |
| 合計       | 6 request |       15,300 |         3,020 | 46,192 ms |

### 実行コマンドと検証

```powershell
$env:RUN_OPENAI_PHOTO_FIRST_QUALITY='1'
$env:PHOTO_FIRST_QUALITY_GOAL_PAIR='sales-boundary'
pnpm --filter web exec vitest run test/photo-first-provider-quality.live.test.ts --reporter=verbose
```

結果:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    48.20s
Provider requests 6
```

テスト成功は、6リクエスト上限とGoal間の差分assertion、およびcheckerがSalesの不整合を検出したことを示す。販売コンテンツ自体の品質合格を示さない。

### 次の最小タスク

Sales用の写真解析・投稿設計で、一般的な初回来店不安や相談ではなく、承認済みの商品・サービス価値、利用場面、比較、購入理由のいずれかを主題にし、商品閲覧・購入・具体的な購入前質問へ接続する非課金契約テストを追加する。その後、写真解析PromptのSales境界を最小修正する。実Provider再試行は、その修正を別PRで確認し、改めて課金承認を得るまで行わない。

## 9. Sales写真解析・投稿設計の非課金修正（2026-10-02 JST）

- 写真解析Promptを`photo-first-analysis-v2-sales-goal-alignment`へ更新した
- `canonicalGoal=SALES`では、承認済みbusiness profileにある具体的な商品・サービスを一つ選び、価値、使用場面、比較、利用事例、購入理由のいずれかを投稿設計の中心にする契約を追加した
- 一般的な初回来店不安、一般的なカウンセリング説明、一般FAQ、対象を示さない相談だけの計画をSalesとして扱わない境界を追加した
- 承認済み情報が不足する場合は事実を補わず、`confirmationQuestion`で不足する一点を確認する契約を追加した
- 同一企業・同一写真相当の入力で、InquiryとSalesの異なるgoal planningとCTA方針がProvider requestへ渡る非課金テストを追加した
- 実Providerは再実行していない。Sales生成品質の実測判定は、前節の`RISK_REPRODUCED`のままである

次の最小タスクは、当該修正のCI完了とマージ後に、別途課金承認を得た場合に限り、前節と同じ`INQUIRY` / `SALES`の合成入力を6リクエスト上限で再検証することである。

## 10. Sales写真解析修正後の実Provider再検証（2026-10-02 JST）

### 実行条件

- 対象branch: `codex/hassy-sales-photo-provider-revalidation`
- 基準main: `1cb2ef47a1cc8fce7096b34d8c76594be8946216`
- 実行日時: `2026-10-02 08:02 JST`（Provider結果のUTC: `2026-10-01T23:02:36.979Z`）
- Goal: `INQUIRY`、`SALES`
- モデル指定: `gpt-5.2`（Provider応答: `gpt-5.2-2025-12-11`）
- 入力: 前節と同一hashの合成JPEG、同一架空企業、同一対象顧客、同一Mission、同一直近履歴
- 写真SHA-256: `a1ea5282660ec7fa278aec26b11994b8a4fb1b9446be54558f4ad4d09e11f2b1`
- 外部通信: Goalごとに写真解析、本文生成、品質判定を各1回、合計6回
- 再試行: なし
- 実ユーザー情報、本番DB、Storage、LINE、SNS: 使用なし

### 実行結果

| 項目          | 問い合わせ（`INQUIRY`）                      | 販売（`SALES`）                                    |
| ------------- | -------------------------------------------- | -------------------------------------------------- |
| 主題          | 施術前確認を見える化し、相談ハードルを下げる | カウンセリング付き施術の価値を購入判断材料にする   |
| 読者価値      | 来店前に悩みや希望を整理できる               | 聞き漏れと仕上がりのズレを減らす仕組みを理解できる |
| CTA           | LINEで髪の悩みを一つ送り、事前相談する       | 予約ページからカウンセリング＋施術を予約する       |
| checker       | `PASS` / 92点                                | `PASS` / 92点                                      |
| checker issue | なし                                         | なし                                               |
| 判定          | `SAFE_WITHIN_TESTED_SCOPE`                   | `SAFE_WITHIN_TESTED_SCOPE`                         |

修正前のSalesは「初回来店の不安解消」「DMで初回相談」に留まり、Inquiryとの差が不十分だった。修正後は、同じ写真と企業情報でも、Salesのtheme、angle、recommendation reason、photo usage、本文、写真案、CTAが「カウンセリング付き施術というサービス価値」と「予約」へ分岐した。Inquiryは悩み整理とLINE事前相談を維持しており、CTA末尾だけではない戦略差を確認した。

この結果は、架空の美容室1社、合成写真1枚、1回の出力に限る。全業種・全商品、実ユーザー入力、修正再生成、本番E2Eの品質を証明しない。ただし、SalesについてGoalから投稿設計、本文、写真案、CTAまで差が出るLevel 4相当の経路を、この実測条件では確認した。

### Telemetry

| Goal       | 工程      | input tokens | output tokens |   latency |
| ---------- | --------- | -----------: | ------------: | --------: |
| 問い合わせ | 写真解析  |        2,334 |           665 | 11,751 ms |
| 問い合わせ | 本文生成  |        2,962 |           641 |  9,951 ms |
| 問い合わせ | 品質判定  |        2,570 |            22 |  1,200 ms |
| 販売       | 写真解析  |        2,325 |           674 |  9,675 ms |
| 販売       | 本文生成  |        2,991 |           515 |  8,140 ms |
| 販売       | 品質判定  |        2,458 |            22 |    930 ms |
| 合計       | 6 request |       15,640 |         2,539 | 41,647 ms |

### 実行結果

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    46.55s
Provider requests 6
Retry       0
```

次の最小タスクは、今回の実測証跡をマージした後、Sales以外の未検証Goalである`TRUST_EXPERTISE`を、既存の認知Goalと同じ合成条件で非課金fixture・契約テストから確認することである。追加の実Provider検証は別途承認を得るまで行わない。

## 11. Trust / Expertiseの非課金差分テスト（2026-10-02 JST）

- 認知Goalと会社、対象顧客、写真bytes、Mission、直近履歴を同一にし、Goalとgoal planningだけを`TRUST_EXPERTISE`へ変更するfixtureを追加した
- 認知は「店舗の丁寧な考え方を知る」、Trust / Expertiseは「施術前に何を見て、なぜ確認するかという判断根拠と仕事のプロセスを伝える」へ分岐させた
- theme、angle、recommendation reason、本文、写真案、CTAの全項目が異なることをassertした
- Trust / ExpertiseのCTAは、一般的な認知獲得ではなく判断手順の保存へ接続した
- 同一画像bytesが両Goalで維持され、Goal以外の条件が変わっていないことを確認した
- 将来の実Provider検証用に`trust-awareness`ペアを追加した。通常テストでは明示フラグがないためskipされ、外部通信しない

非課金fixtureは期待する構造とProvider requestへのGoal伝播を固定するが、実モデルがその品質で生成することは証明しない。Trust / Expertiseの実Provider品質は`INCONCLUSIVE`のままである。

次の最小タスクは、この非課金テストのCI完了とマージ後に、別途課金承認を得た場合に限り、同一合成入力の`BRAND_AWARENESS` / `TRUST_EXPERTISE`を6リクエスト上限・再試行なしで実Provider比較することである。

## 12. Trust / Expertiseの実Provider検証（2026-10-02 JST）

### 実行条件

- 対象branch: `codex/hassy-trust-awareness-provider-validation`
- 基準main: `96766a8cd0261c7d84309ba3a2363c1e40f7ec26`
- 実行日時: `2026-10-02 08:47 JST`（Provider結果のUTC: `2026-10-01T23:47:57.046Z`）
- Goal: `BRAND_AWARENESS`、`TRUST_EXPERTISE`
- モデル指定: `gpt-5.2`（Provider応答: `gpt-5.2-2025-12-11`）
- 入力: 同一hashの合成JPEG、同一架空企業、同一対象顧客、同一Mission、同一直近履歴
- 写真SHA-256: `a1ea5282660ec7fa278aec26b11994b8a4fb1b9446be54558f4ad4d09e11f2b1`
- 外部通信: Goalごとに写真解析、本文生成、品質判定を各1回、合計6回
- 再試行: なし
- 実ユーザー情報、本番DB、Storage、LINE、SNS: 使用なし

### 実行結果

| 項目          | 認知（`BRAND_AWARENESS`）                            | 信頼・専門性（`TRUST_EXPERTISE`）                        |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| 主題          | 施術前のすり合わせを大切にする店舗の考え方           | 施術前確認を仕組みにし、仕上がりのズレを減らすプロセス   |
| 切り口        | 準備の文化を伝え、来店前の安心材料として知ってもらう | 何を・なぜ確認するかを3点に絞り、判断根拠を伝える        |
| CTA           | 美容室選びのために投稿を保存                         | 来店前に確認手順を整理するために投稿を保存               |
| checker       | `REVISE` / 78点                                      | `PASS` / 92点                                            |
| checker issue | ハッシュタグ形式、写真指示の固定的な個数指定         | なし                                                     |
| Goal差        | 店舗の特徴・考え方を知ってもらう認知設計             | 専門的な確認手順と、その理由を理解してもらう信頼形成設計 |
| 判定          | Goal差: `SAFE_WITHIN_TESTED_SCOPE` / 品質: 要修正    | `SAFE_WITHIN_TESTED_SCOPE`                               |

同じ企業情報、写真、Mission、履歴でも、認知は店舗の考え方と安心材料の周知、信頼・専門性は確認項目、判断根拠、再現可能な仕事のプロセスへ分岐した。theme、angle、recommendation reason、本文、写真案、CTAの差分assertionもすべて通過したため、CTA末尾だけを差し替えた出力ではない。

信頼・専門性はcheckerで`PASS / 92点`となり、Goalから投稿設計、本文、写真案、CTAまで差が出るLevel 4相当の経路を、この実測条件では確認した。認知はGoal差を満たした一方、生成されたハッシュタグの一部が`##`になり、写真指示も「チェックボックス3つ」と固定的だったため`REVISE / 78点`となった。このテスト成功を、認知出力を含む両Goalの最終品質合格とは扱わない。

### Telemetry

| Goal         | 工程      | input tokens | output tokens |   latency |
| ------------ | --------- | -----------: | ------------: | --------: |
| 認知         | 写真解析  |        2,333 |           750 | 12,077 ms |
| 認知         | 本文生成  |        3,100 |           440 |  6,797 ms |
| 認知         | 品質判定  |        2,422 |           301 |  5,471 ms |
| 信頼・専門性 | 写真解析  |        2,343 |           722 | 11,114 ms |
| 信頼・専門性 | 本文生成  |        3,048 |           600 |  9,819 ms |
| 信頼・専門性 | 品質判定  |        2,551 |            22 |  1,658 ms |
| 合計         | 6 request |       15,797 |         2,835 | 46,936 ms |

### 実行コマンドと検証

Node.js 24.19.0と、リポジトリ指定のpnpm 10.10.0で実行した。

```powershell
$env:RUN_OPENAI_PHOTO_FIRST_QUALITY='1'
$env:PHOTO_FIRST_QUALITY_GOAL_PAIR='trust-awareness'
pnpm --filter web exec vitest run test/photo-first-provider-quality.live.test.ts --reporter=verbose
```

結果:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    49.61s
Provider requests 6
Retry       0
```

今回確認できたのは、架空の美容室1社、合成写真1枚、各Goal 1出力における実Providerの差である。全業種、実写真、実ユーザー入力、複数回の出力安定性、本番E2E、利用枠、課金記録、Storage、LINE通知は未確認である。

### 次の最小タスク

認知Goalで再現した`##`形式のハッシュタグを公開前に正規化できるよう、まず非課金の契約テストで期待形式を固定する。写真指示の過度に固定的な個数指定は別の品質条件として分け、同じ修正へ混在させない。追加の実Provider再検証は、非課金修正の確認後に改めて承認を得るまで行わない。

## 13. 正規化・写真指示修正後の再検証開始時に判明した内部上限（2026-10-02 JST）

### 実行結果

- 基準main: `c358c76ef2c844ac71a8a3239cf96c05ab0d6ec0`
- 実行開始: `2026-10-02 10:12 JST`
- 対象Goal: `BRAND_AWARENESS`、`TRUST_EXPERTISE`
- 外部リクエスト: 写真解析1回
- 本文生成: 0回
- 品質判定: 0回
- 再試行: なし
- 結果: `INCONCLUSIVE`

live testを本番の`GenerateMissionContent`経路へ接続したところ、認知Goalの写真解析完了後、構造化された写真解析・投稿設計を内部の`variantInstructions`へJSON文字列として渡す段階で、既存の1指示500文字上限を超えて`VALIDATION_ERROR`となった。Providerの本文生成前に停止したため、PR #1063とPR #1064の実Provider品質効果はこの実行では判定していない。

従来のlive testは`OpenAIMissionContentGenerator` Adapterを直接呼び、`GenerateMissionContent`の入力検証と保存前正規化を迂回していた。このため、実Provider出力の長さで発生する本番経路の制約を検出できていなかった。実際の本番障害発生件数は未確認であり、この検証結果だけで実ユーザー障害が発生したとは断定しない。

### 非課金修正

- 写真解析と投稿設計のJSON全体を2本の指示へ埋め込む方式を廃止
- 確認済み画像情報、未確定情報、投稿テーマ・切り口、推奨理由・写真利用へ意味別に分割
- 各指示を既存契約どおり500文字以内に制限
- 画像内文字を命令ではないデータとして明示
- live testを本番の`GenerateMissionContent`と同じ正規化経路へ接続
- 長い場面・切り口を含むfixtureで、必要なラベルが末尾切り捨てで失われないことを確認

### 次の最小タスク

この非課金修正をレビュー・マージした後、別途課金承認を得て、同じ`BRAND_AWARENESS` / `TRUST_EXPERTISE`を最大6リクエスト・再試行なしで最初から実行する。今回未使用だった5リクエストを自動的に繰り越したとは扱わない。

## 14. 正規化・写真指示・内部上限修正後の実Provider再検証（2026-10-02 JST）

### 実行条件

- 対象branch: `codex/hassy-trust-provider-revalidation-final`
- 基準main: `90072a58bc4d91db390bf90600516a9402e03f33`
- 実行日時: `2026-10-02 10:50 JST`（Provider結果のUTC: `2026-10-02T01:50:56.218Z`）
- Goal: `BRAND_AWARENESS`、`TRUST_EXPERTISE`
- モデル指定: `gpt-5.2`（Provider応答: `gpt-5.2-2025-12-11`）
- 入力: 以前の検証と同一hashの合成JPEG、同一架空企業、同一対象顧客、同一Mission、同一直近履歴
- 写真SHA-256: `a1ea5282660ec7fa278aec26b11994b8a4fb1b9446be54558f4ad4d09e11f2b1`
- 外部通信: Goalごとに写真解析、本文生成、品質判定を各1回、合計6回
- 再試行: なし
- 実ユーザー情報、本番DB、Storage、LINE、SNS: 使用なし

### 実行結果

| 項目          | 認知（`BRAND_AWARENESS`）                              | 信頼・専門性（`TRUST_EXPERTISE`）                    |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 主題          | 施術前の確認を仕組みにしている店舗姿勢                 | 確認・合意・施術反映という仕事のプロセス             |
| 切り口        | 伝え漏れ・聞き漏れを減らす準備を店舗の特徴として伝える | 何を確認し、なぜ確認するかを具体化して専門性を伝える |
| CTA           | 続く確認方法の投稿を見るためのフォロー                 | 来店前に確認項目を整理するための保存                 |
| checker       | `PASS` / 88点                                          | `PASS` / 92点                                        |
| checker issue | なし                                                   | なし                                                 |
| ハッシュタグ  | すべて先頭`#`1個へ正規化済み                           | すべて先頭`#`1個へ正規化済み                         |
| 写真指示      | アップロード済み写真を表紙に使い、撮り直しを要求しない | アップロード済み写真を使い、撮り直しを要求しない     |
| 判定          | `SAFE_WITHIN_TESTED_SCOPE`                             | `SAFE_WITHIN_TESTED_SCOPE`                           |

同一の企業情報、写真、Mission、履歴でも、認知は店舗の誠実な準備を知ってもらう設計、信頼・専門性は確認項目とその理由、合意から施術へ反映するプロセスを理解してもらう設計へ分岐した。theme、angle、recommendation reason、本文、写真利用、CTAの差分assertionはすべて通過し、CTA末尾だけの変更ではない。

PR #1063の正規化後は、前回認知出力にあった`##`形式が再発せず、全ハッシュタグが先頭`#`1個になった。PR #1064後は、両Goalの`photoInstruction`がアップロード済み写真の配置・切り取り・文字利用を説明し、新規撮影や写真にない小物の追加を要求しなかった。PR #1065後は、実Providerの写真解析・投稿設計が既存の1指示500文字上限内で本文生成へ伝播し、内部validationで停止しなかった。

信頼・専門性の本文は未確認の店舗固有項目を実績として断定せず、「例」として説明している。ただし、この1出力だけで、あらゆる未確定情報が常に適切に例示扱いになることは保証しない。

### Telemetry

| Goal         | 工程      | input tokens | output tokens |   latency |
| ------------ | --------- | -----------: | ------------: | --------: |
| 認知         | 写真解析  |        2,333 |           686 | 13,795 ms |
| 認知         | 本文生成  |        3,103 |           543 |  8,928 ms |
| 認知         | 品質判定  |        2,505 |            22 |  1,456 ms |
| 信頼・専門性 | 写真解析  |        2,343 |           740 | 12,868 ms |
| 信頼・専門性 | 本文生成  |        3,235 |           549 |  8,074 ms |
| 信頼・専門性 | 品質判定  |        2,592 |            22 |    942 ms |
| 合計         | 6 request |       16,111 |         2,562 | 46,063 ms |

### 実行コマンドと検証

Node.js 24.19.0と、リポジトリ指定のpnpm 10.10.0で実行した。

```powershell
$env:RUN_OPENAI_PHOTO_FIRST_QUALITY='1'
$env:PHOTO_FIRST_QUALITY_GOAL_PAIR='trust-awareness'
pnpm --filter web exec vitest run test/photo-first-provider-quality.live.test.ts --reporter=verbose
```

結果:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    51.15s
Provider requests 6
Retry       0
```

### 制約

この結果は、架空の美容室1社、合成写真1枚、各Goal 1出力の範囲に限る。実写真、複数業種、出力の反復安定性、確認質問への回答後の再生成、本番E2E、利用枠、実原価記録、Storage、LINE通知は未確認である。今回のlive testは本番の`GenerateMissionContent`による入力検証・正規化を通すが、本番DBへの保存と利用枠・AI Usage記録までは実行していない。

### 次の最小タスク

追加課金を行わず、Photo Firstの確認質問が残る場合に、未確認の店舗固有情報を断定せず「例」としてのみ扱う境界を非課金fixtureで固定する。これにより、今回の1出力で守られた挙動を再現可能な契約にする。
