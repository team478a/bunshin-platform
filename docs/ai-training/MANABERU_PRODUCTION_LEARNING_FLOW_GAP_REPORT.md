# マナベル本番の学習フローと未公開機能の調査

作成日: 2026-10-16  
対象: 現在の `main` にあるAI研修機能と本番Wave 0手順の差分調査  
区分: 調査資料のみ。本番設定・DB・Program・Definition・Enrollment・Pilotを変更しない。

## 結論

現在のコードとWave 0 Runbookは限定的な固定Definition経路を記述している。一方、2026-10-16〜17にサービス責任者は、マナベルスタイルは自由希望から始まる動的経路を本線にし、固定経路はマナベルでは使わない（既存コードは残す）と決定した。決定でコードの状態は変わらず、main上の動的経路も `personalLearningRequestEnabled()` が `PERSONAL_LEARNING_REQUEST_INTAKE=true` **かつ** `APP_ENV` が `development` または `staging` の場合だけ有効であるため、Productionでフラグをtrueにするだけでは提供できない。

決定済みの提供方針と、まだ必要な承認・技術検証は以下の表で分離する。Launch Runbook上のWave 0は引き続きNO-GOであり、Production release、全migration、実DBとrole/RLS、本人同意、実AI費用・Admission、停止/drain、自動削除等が未解決。これは新経路の本番公開やWave 0開始の承認ではない。

## サービス責任者の決定で解消したもの（2026-10-16〜17）

| 項目                     | 決定内容                                                                                                                                   | 記録先                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| マナベルの本線           | 教材なし・自由希望起点の動的経路。固定経路はマナベルでは使わないが既存コードは残す                                                         | [AI進化方針ADR](ADR_MANABERU_AI_EVOLUTION_POLICY.md)、`docs/DECISION_LOG.md` |
| 外部初回公開の機能範囲   | 会話、複数テーマ、LINE学習、対応範囲の拡大を含める。内部テスターはA/B後から段階公開                                                        | 本線化指示書v3 §3、ADR                                                       |
| PRの進め方               | PR-0→A→B→C→D→E→F→G、続いてH/I。1本ずつDraft＋報告・田中確認後に次へ                                                                        | ADR、`docs/IMPLEMENTATION_ROADMAP.md`                                        |
| 保持・本人操作・運営閲覧 | 動的経路データは`TRAINING_RETENTION_V1`に揃える。本人は確認・修正・Export・削除可。運営者は件数/状態だけで、本人が明示共有した会話のみ例外 | `docs/DECISION_LOG.md`、本線化指示書v3 §4                                    |
| Phase 1→Phase 2の承認    | **未解消**。PR #1のマージは確認したが、GitHub上の正式レビューsubmission/コメントは確認できず。田中のPR-0上での明示承認が必要               | §「まだ未解決」の表、本PR実装報告                                            |

※上記は提供方針の決定であり、機能実装、Migration、Production設定、Pilot開始、外部公開の許可ではない。

## 本番Wave 0で想定している既存フロー

Launch RunbookのProduction E2Eは、自由希望をその場で教材化する経路ではなく、既存のAI_TRAINING_V1と固定Definitionを使う。

1. 本人が有効なEnrollmentでログインし、Goal候補を確認して明示確定する。
2. 既存のPlanを確認し、本人が別途確定する。3 Stepは3日間や修了判定を意味しない。
3. Routerが既存固定Definitionを順に選ぶ。Runbookでは `PROMPT_STRUCTURE`、その前提となる `PROMPT_BASIC`、その後の `CONTEXT_SETTING` → `CONSTRAINT_SETTING` が例示されている。固定3Definitionの完全なDefinition参照・版は、開始前に承認済みのDefinition一覧と照合する。
4. 本人は安全な架空題材を使い、自分のAIツールに入力し、出力を確認・必要に応じ修正する。サービスが完成品を代作したり、外部ツール操作を観測したりするものではない。
5. 本人が書いた指示を提出し、既存評価Jobで評価する。提出物で確認できたこと、本人申告、未確認事項を混同しない。PASSと本人操作・確認・有用性の明示申告が揃う前に実践完了やFirst Successを記録しない。
6. Fitを記録し、RouterのREVIEW/RETRYまたは次の固定課題へ進む。再ログイン後も同じGoal/Plan/Assignmentへ戻れることを確認する。

この経路も「Productionで今すぐ使える」とは断定できない。Runbookの現在判定はNO-GOであり、実DB、Definition承認、実認可、release/deploy、開始Gateの証拠は別途必要である。また固定3Definitionの教育判断・本番APPROVEは、本番開始前に実施する別の人間判断である。

## mainにあるがProductionでは露出しない新経路

| 機能                        | main上の到達点                                                    | Productionでの現状/注意                                                                     |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 自由希望受付 (#1261, #1263) | 本人の希望・環境の保存、再訪                                      | `personalLearningRequestEnabled()` がproductionを拒否。入口を出さない                       |
| 教材候補 (#1265)            | 希望・版に基づく候補生成、保存、同一候補の本人確認                | Production入口なし。候補の構造検査や本人確認は教育品質保証ではない                          |
| 動的実践開始 (#1266)        | 同版教材を既存Goal/Plan/Assignmentへ接続、本人の作業記録・再開    | Production入口なし。Profile技能や修了を自動更新しない                                       |
| AI途中支援 (#1267)          | 現在課題に結びついたテキスト相談、履歴再訪                        | Production入口なし。自動再試行なし、失敗/原価不明は安全側で停止                             |
| 提出レビュー (#1268)        | 提出Revisionごとの課題固有レビュー、観察/本人申告/未確認の分離    | Production入口なし。旧固定6技能評価へ転用せず、PASS/習得認定を自動追加しない                |
| 次の実践 (#1269)            | 確認済み証拠の後に次候補を提案し、本人確認後にPlan revisionを切替 | Production入口なし。未達・本人申告だけでは次課題へ進めない                                  |
| 画像付き途中相談 (#1270)    | 本人が選ぶ静止画1枚を既存相談へ紐付け、正規化・所有検査           | Production入口なし。容量上限と既存Admissionを満たさなければ失敗し、料金不明を無料扱いしない |

これらの実装レポートはいずれも、合成試験・一部隔離DB試験と実AI/実本人/本番運用を区別している。mainにマージされたことだけで本番対応済み、学習効果確認済み、公開許可済みとはならない。

## 本番で有効化するために不足するものと推奨順

1. **提供範囲の設計判断は解消済み**: マナベルの本線は動的経路とする。実装・Production Gate・教育品質の検証は別項目として残る。
2. **機能完成レビュー**: 希望→候補→同版確認→実践→途中支援→証拠別レビュー→継続/次課題→再ログインまで、異なる希望の実経路で確認する。現在の報告では実AI・実受講者の通し検証や学習効果は未確認。tool-specificな根拠が不足する場合の質問停止も確認する。
3. **Admission/費用の運営値決定**: `PERSONAL_LEARNING_LESSON_ADMISSION` のService/Program完全一致、固定model、UTC日次attempt上限、同時実行上限、最大request bytes、最大output tokens、USD日次上限を承認する。`PERSONAL_LEARNING_AI_PRICING` の有効なProvider/model/価格版と一致させ、Provider account全体のAdmission/予算も別Gateとして確認する。欠損、料金不明、通信終了不明、Usage保存失敗は0円・空き枠とせず拒否/要調査のままにする。
4. **Release/DBレビュー**: mainとproductionの全差分、必要migration、checksum/drift、Backup/隔離restore、role/RLS、rollback互換性をDB ownerとrelease責任者が確認する。コード公開より先に、どのDB versionが必要かを固定する。
5. **環境・サービスGate設計**: `personalLearningRequestEnabled()` がproductionで常にfalseとなる意図を再確認する。動的経路を公開する判断があれば、単なるAPP_ENV例外や環境flag追加で解除せず、専用Service/Program、受講資格、本人同意、definition/policy revision、Admission、kill switch、既存V1非影響を含むfail-closedなallowlist Gateと否定テストを別PRで設計する。
6. **運用準備・人間承認**: Launch Runbook/Execution Checklistの各UNKNOWNを実証拠で埋め、内部1〜2人の限定条件、監視・連絡担当、Privacy/保持、停止とdrain、費用・実課金同意を確認する。DB準備、Definition APPROVE、内部Enrollment/Profile、STARTは各々別承認とする。
7. **限定release後の段階的観測**: 固定SHAのProduction release/deployとV1/Auth/LINE/Pilot OFF smokeを別承認で実施。準備flagを閉じた状態で内部1人から段階的に試し、運用責任者が証拠をレビューするまでWave拡大しない。外部Wave、通常募集、一般公開を自動的に含めない。

順番は「機能フラグを先にON」ではない。Gateの欠損を特定し、固定release/DB互換性と機能の安全性を確認した後、実運用値・承認を一つずつ確定する。

## 主なリスクと抑制策

- **不完全な画面/定義**: 自由希望の入力だけ、候補の表示だけ、構造schema成功だけで完成と誤認する。一本の学習体験と教育品質レビューが終わるまで露出しない。
- **過剰なAI費用/多重送信**: 候補生成、相談、レビュー、次課題提案など複数操作が費用を生む。操作別の無制限retryを許さず、同一Programロックのattempt/concurrency/cost予約、Provider全体上限、実Usage記録を両方維持する。
- **原価の過小計上**: cached discountや事後の安い利用量で事前予約を戻さない。現在価格と上限の版を保存し、実費が予約超過なら使用額を引き上げる。NULL/UNKNOWN、予約未精算、Provider請求不一致を0円扱いしない。
- **画像/個人情報**: 画像本文・希望・回答・Provider応答を通常ログやAudit metadataへ複製しない。画像容量・形式・正規化・所有/保持/削除・exportの全経路を確認する。
- **結果の過大解釈**: 本人申告と提出で観測できたこと、外部AIを本人が操作したという申告を分ける。合格、First Success、Goal完了、修了、Capability習得を自動認定しない。
- **共有資源への影響**: Pilot対象外でもDB/worker/Provider quotaは共有される。特定Serviceへの論理scopeだけで物理隔離や他Service無影響と主張しない。
- **既存V1/通知への波及**: 予約Program marker、allowlist、通知OFF、scheduler/broadcast除外、既存V1継続を再検証する。共通CronやLINE送信を全停止して代用しない。
- **停止不能/処理中call**: Kill switchを実際に操作できる担当・instance反映・既送信callのdrainを確認する。STOP操作や環境更新だけでは送信済みcallの取消にならない。

## まだ未解決で、別途の承認・検証が必要なもの

| 項目                                                   | 必要な確認・承認                                                                                                                                               | 担当/時期        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Phase 1完了とPhase 2以降への移行                       | PR #1の正式レビュー記録がない事実を踏まえ、田中がPR-0上で明示承認。承認前にPR-Aへ着手しない                                                                    | PR-0             |
| 機能完成・教育品質                                     | 動的経路の希望→実践→支援→提出→次実践を、実AI・実受講者または承認済み評価で通し確認する。学習効果は別途評価し、未検証を効果として表示しない                     | PR-G             |
| Admission・費用・テーマ数・範囲外リスト・LINE Push上限 | PR-C〜Fで具体案を提出し、田中が運用値を決める                                                                                                                  | 該当PR           |
| Release/DB/本番Gate                                    | mainとproduction差分、migration/checksum/drift、Backup/restore、role/RLS、rollback、同意、停止/drainを人間レビュー                                             | 各本番release    |
| 復元元Backupの証明                                     | 復元に使った元Backupの識別子・取得時刻・復元先との来歴を、信頼できる既存記録で確認する。件数比較や推測でPASSにせず、証拠が得られるまでUNKNOWN/未完了として扱う | PR-G・外部公開前 |
| 自動削除                                               | `TRAINING_RETENTION_V1`の対象拡張、Export/削除全経路、AI研修retention cronの本番登録・動作確認と別途承認。現状の`apps/web/vercel.json`にはretention cronがない | 外部公開前       |
| 運用開始・外部公開                                     | 本番release、内部Enrollment/Seat/Profile、費用・監視、停止手順、Wave 0開始、外部公開を別々に承認                                                               | Runbook/PR-G     |

現在もProduction request intakeは拒否される設計であり、この文書更新では変更しない。Launch RunbookとExecution Checklistの実環境NO-GO/UNKNOWNは保持する。

本書は判断材料であり、環境値・Production設定・ServiceProgram・Definition承認・Enrollment/Seat・Pilot開始/停止・Deployを実施していない。

## 根拠

- `apps/web/src/services/personal-learning-request-access.ts`
- `docs/ai-training/MANABERU_STYLE_PRODUCTION_WAVE0_LAUNCH_RUNBOOK.md`
- `docs/ai-training/MANABERU_STYLE_WAVE0_EXECUTION_CHECKLIST.md`
- `docs/ai-training/MANABERU_FREE_INTENT_PRACTICE.md`
- `docs/ai-training/MANABERU_LESSON_CANDIDATE_IMPLEMENTATION.md`
- `docs/ai-training/MANABERU_DYNAMIC_PRACTICE_START_IMPLEMENTATION.md`
- `docs/ai-training/MANABERU_PRACTICE_SUPPORT_IMPLEMENTATION.md`
- `docs/ai-training/MANABERU_PRACTICE_RESULT_REVIEW_IMPLEMENTATION.md`
- `docs/ai-training/MANABERU_RESULT_DRIVEN_NEXT_PRACTICE_IMPLEMENTATION.md`
- `docs/ai-training/MANABERU_PRACTICE_SUPPORT_IMAGE_IMPLEMENTATION.md`
- `packages/application/src/personal-learning-call-admission.ts`
