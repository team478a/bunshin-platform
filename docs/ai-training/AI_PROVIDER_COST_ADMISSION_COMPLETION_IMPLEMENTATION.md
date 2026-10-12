# AI Provider費用Admission統合 実装報告

## 1. 調査した内容

`main`の共有Provider Runtime、`AiUsageEvent`、`ai_provider_call_admissions`、Personal Learning専用Admission、管理Alert、OpenAI実送信境界を調査した。

既存の原子的予約は週次Plan、Trend調査、Social Insight、商品提案へ限定され、動画Plan、Account Strategy、占い、ナレーション、Bunshin提案、Group Knowledge抽出、Daily Mission、投稿別案、SNS画像、学習評価、人格学習には未予約の実送信経路が残っていた。複数call処理を一括1件として扱うと、再生成や品質判定の実費を過少予約することも確認した。

Creatomate、FAL、Runwayは既存の動画専用費用Policy／生成台帳を使用しているため、今回のOpenAI共有Admissionへ重複接続していない。キュー投入や設定確認だけを行うresolverも費用予約対象にしていない。

## 2. 変更したファイル

- Application／Database
  - 任意の保守的予約額、または最大100 callの固定単価合計を原子的に予約できる契約
  - OPEN予約の管理集計、既知費用実績と一致する予約だけの復旧、SUPER_ADMIN監査
  - OPEN予約額を含む管理予算Alert、15分を超える未精算予約Alert
- Web Provider実送信境界
  - 動画Plan、Account Strategy、占い、ナレーション、Bunshin提案
  - Group Knowledge抽出、Daily Mission、Mission Content Variant
  - SNS画像生成／品質判定／再生成／サンプル／ページ修正
  - AI Training回答評価、人格学習提案
- 管理画面
  - `/admin/ai`の未精算予約一覧と、記録済み実績だけを復旧する操作
  - `/api/admin/ai-provider-admissions/recover`
- テスト
  - 可変額／複数call予約、厳格保存後精算、復旧一致条件、Alert、各既存経路の回帰

DB schemaとmigrationは追加していない。既存の`ai_provider_call_admissions`と設定監査を再利用した。

## 3. 主要な設計判断

予約単位は処理全体ではなく、外部Providerへ送る各callとする。Daily Missionのbrief、本文、品質判定、修復、rebrief、SNS画像の各ページ生成・品質判定・再生成は、それぞれ独立したoperation keyで予約する。Group Knowledge動画抽出は最大2 callを一度に保守的予約し、実績は実際に試行したcall数で記録する。

文字数で上限が決まるナレーションは、送信前に文字数から保守的金額を明示予約する。固定単価経路は管理設定の1 request原価を使用する。価格・予算・モデルをコードで補完しない。

Provider未送信のquota／権限拒否は、費用不明ではなく既知の0円として記録して予約を精算する。Provider送信後は成功／失敗の使用量をstrictに保存してから予約を精算する。使用量保存または精算に失敗した場合はOPENのまま保持し、同じoperation keyの自動再送を許可しない。

復旧はTTLや失敗種別から推測しない。保存済み`AiUsageEvent.idempotencyKey`のSHA-256がOPEN予約のoperation digestと一致し、かつ費用がNULLでない場合だけ精算する。復旧はSUPER_ADMIN、理由、監査を必須とし、最大100件ずつ処理する。使用量記録がない予約、費用UNKNOWN、Provider終了未確認の予約は解放しない。

Personal Learning回答評価は、Pilot Program専用AdmissionとProvider account全体Admissionを別Gateとして両方通す。両台帳は別の上限を守るものであり、利用実績を二重計上しない。

## 4. 実行した検証

- Application費用Gate／Alert関連: 2 files / 23 tests成功
- Database Provider設定／予約／復旧関連: 1 file / 5 tests成功
- Web費用Admission主要経路: 4 files / 29 tests成功
- Web全体: 468 files成功、2 files skip / 3,294 tests成功、2 tests skip
- Database全体: 197 files / 956 tests成功
- `pnpm test`: Architecture 10 testsと全25 Turbo tasks成功
- `pnpm typecheck`: 全25 Turbo tasksとLearning UI型検査成功
- `pnpm lint`: Architecture boundaryと全25 Turbo tasks、Learning UI lint成功（変更外の既存warning 1件）
- `pnpm build`: 全13 Turbo tasksとNext.js production build成功
- `pnpm format:check`、`git diff --check`成功

本番DB、実Provider、利用者データ、実課金は使用していない。

## 5. 未解決事項

- Provider請求書／請求APIとの金額照合、税、為替、請求確定額は未実装。管理画面の金額は管理設定または既存Pricing Registryによる内部推定であり、請求承認には使わない。
- 古いOPEN予約の外部通知（メール／LINE等）は未実装。管理Alert Centerには表示する。
- 使用量記録が存在しないOPEN予約は自動・手動とも解放しない。Provider側の終了証跡を取り込む別設計が必要。
- Creatomate、FAL、Runwayは既存動画専用Policyのままで、共有Admissionへの統合やProvider請求照合は行っていない。
- 本番の価格、予算、active設定、既存UNKNOWN、OPEN予約、RLS role、全instance更新は未確認。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。production基点の限定releaseで、対象commit、既存migration状態、active Provider設定、当月UNKNOWN、OPEN予約、停止／rollback手順を人間が確認する。

本番設定変更、Deploy、Provider送信、参加者登録、Pilot開始、実課金はそれぞれ明示承認を待つ。Provider請求照合または使用量記録のない予約復旧へ進む場合は、外部証跡と権限を別途設計・承認する。
