# Personal Learning 金額ベース費用Hard Stop 実装報告

## 1. 調査した内容

既存Pilot Admissionは、Provider直前にProgram単位のadvisory lockを取得し、UTC日次attempt、同時実行数、request bytes、output tokensを制限していた。原価はProvider応答後のTelemetryで推定するため、観測やAlertはできても送信前のUSD予算制限ではなかった。

既存`PERSONAL_LEARNING_AI_PRICING`はProvider、応答Model、有効日時、input/output/cached input単価、価格版を保持する。新しいBilling基盤や外部価格取得を作らず、このレビュー済み価格とAdmission台帳を再利用する。

## 2. 変更したファイル

- Application: Admission設定と保守的費用予約の純粋契約・単体テスト
- Database: Admission時の日次予約集計、価格版保存、Migration、統合テスト
- Web: Pricing Registry接続、Provider識別、START時の設定整合確認、回帰テスト
- Runbookと既存Admission実装報告

## 3. 主要な設計判断

`PERSONAL_LEARNING_CALL_ADMISSION`へ`dailyCostLimitUsdMicros`を必須追加する。既存8項目設定、未知field、0、非整数、安全整数外は拒否する。設定既定値や自動換算は設けない。

1回の予約額は次で計算する。

```text
ceil(maxRequestBytes × inputPrice / 1,000,000)
+ ceil(maxOutputTokens × outputPrice / 1,000,000)
```

UTF-8 Provider request全体のbyte上限を入力token数の保守的上限として扱う。tokenは1 byte未満を表現しないため、実入力tokenを過小評価しない。cached input割引は使わない。価格はProvider/Model完全一致かつDB時計以前の最新effectiveFromだけを使う。価格不明、未来価格、0円価格、overflowは呼出しを拒否する。

同一ProgramのDB lock内で当日予約合計へ新規予約を足し、日次上限を超える場合はProvider送信前に拒否する。実績が予約より低くても返金しない。失敗、retry、送信前の停止も既存attempt方針どおり予約を保持し、予算回避に使わせない。

Migrationは`reserved_cost_usd_micros`と`pricing_version`をnullableで追加する。既存台帳を推測backfillしない。同日内にNULLの旧行があれば予算不明として新規Admissionを停止する。新規行は両方を必須保存し、DB CHECKで片方だけの保存を拒否する。

## 4. 実行した検証

- Application純粋契約: 1 file / 14 tests成功。厳格設定、切上げ、完全一致価格、未来/欠損価格拒否を確認。
- Web: 3 files / 34 tests成功。設定不正、Pilot停止、モデル不一致、価格不足、1回予約額が日次予算超過するSTART拒否、固定エラーを確認。
- 使い捨てPostgreSQL 16: 専用port・DB名・markerをpreflightし、全234 Migrationを適用。日次予算、並列予約、価格版保存、旧NULL行のfail-closed、既存attempt/同時実行/tenant/Job/Approval回帰を含む統合183件が成功。
- 初回DB統合は機能ケースを含む182件成功、既存本文非保存assertionが新BigInt列をJSON化できず1件失敗。文字列値だけを型安全に検査するよう直し、対象2件と統合全183件を再実行して成功した。
- Application / Database / Web型検査成功。Web初回型検査はブランチ切替前の生成済み`.next`がmain既存routeを認識せず3件失敗し、`next typegen`で最新mainの型を再生成後に成功。
- root `format:check`、`typecheck`（25/25 tasks）、`lint`（25/25 tasks）、`test`（25/25 tasks）、`build`（13/13 tasks）成功。lintは既存の未使用eslint-disable警告1件のみ。
- 初回全体テストでは新Migrationに対するreadiness定数の更新漏れ1件と、高並列時の既存Daily Missionテスト2件の5秒timeoutを検出。readiness定数を修正し、Daily Mission 10件を単独実行して成功。修正後の全体テストはDatabase 951件、Web 3,270件を含め全task成功（Provider live test 2件は既定どおりskip）。
- スマートフォン幅の合成E2Eは3 files / 13 tests成功。
- GitHub CIはPR作成後に最終headの結果を記録する。未完了をPASSにしない。

## 5. 未解決事項

- Provider側account/project budget、rate limit、請求額との照合は別Gate。
- 為替、税、他機能のAI利用はこのPilot日次USD予算に含めない。
- 予約差額の再利用、未知call枠の復旧、外部通知、全instance停止とin-flight drainは実装しない。
- 実価格、日次予算、モデル、環境値を設定していない。本番Migration、Deploy、Pilot開始、実Provider送信、実課金は未実施。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後、採用releaseへこのMigrationとコードを含めるか人間が判断する。本番反映前に既存Admission行、価格版、日次予算、Provider側budget、全instance互換性を確認する。旧コードは費用予約を行わないため、Pilot有効状態で新旧instanceを混在させない。
