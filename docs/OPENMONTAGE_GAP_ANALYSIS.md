# OpenMontage導入差分調査（ワタシワークス）

## 経営判断用結論

**現時点の推奨はA「OpenMontageを導入せず、既存動画基盤を改善」**。現行mainにはDaily Missionからの30秒動画準備、AI場面生成（fal/Kling・Runway）、Creatomate合成、Job、利用枠、非公開Storage、LINE完成通知、レビューのコード経路がある。OpenMontageには多様な映像表現・制作チェックポイント・Remotion/FFmpeg合成の追加価値が見込めるが、実行制御は開発時のAIエージェントを前提とし、無人SaaS運転、テナント隔離、原価・権利処理まで一体で完成しているとは確認できない。品質向上・原価低下は未測定の仮説である。B（本部の社内制作補助）は将来の比較対象、C/Dは法務・技術ゲート通過後に再評価する。これは採用・実装承認ではない。

## 調査固定点と方法

- 調査開始：2026-09-30 12:26 JST（Asia/Tokyo）。Windows NT 10.0.26200.0、Node 24.19.0、pnpm 10.10.0、Python 3.12.3。FFmpegはPATHに存在せず、OpenMontage依存は導入していない。
- bunshin調査ブランチ `codex/openmontage-gap-analysis`、HEAD `29f0f92b056870ccb895692ac8c33873d2d818f2`。取得時点の `origin/main` と同一SHA。関連する未マージPRは確認時点でなし。ローカルと本番稼働バージョンの一致は未確認。
- OpenMontage `calesthio/OpenMontage` の `08e2151fa02de28a5d6a312b3d575692bf147ad7` を固定。GitHubの当該commitのソースを読み取り。READMEやPRのみでは判定していない。実行・依存導入はしていない。
- bunshinの [AGENTS.md](../AGENTS.md)、[仕様](BUNSHIN_PLATFORM_CODEX_SPEC_V1.md)、[設計原則](ARCHITECTURE_PRINCIPLES.md)、[ロードマップ](IMPLEMENTATION_ROADMAP.md)、[判断記録](DECISION_LOG.md)を確認。古いロードマップの「Kling未着手」等より現行コードを優先し、仕様との不整合は未確認事項として扱う。
- 証拠表の「テスト」は対象の単体/契約テストを意味する。Provider実接続、本番E2E、UI操作、顧客データの確認は行っていない。過去の[動画統合報告](DAILY_VIDEO_MEDIA_INTEGRATION_REPORT.md)は補助資料であって今回の実行結果ではない。

## 現行の実コード経路

`企業/商品・Bunshin人格/履歴 → Daily Mission → 動画企画/scene → 承認 → 素材（写真・生成画像・fal/Kling/Runway場面） → Creatomate合成 → 非公開Storage → LINE完成通知 → 確認/採用/修正/再生成`。

Daily Mission起点の自動経路は `apps/web/src/services/automatic-daily-video.ts:118-312` にある。`PRODUCTION`、`READY_TO_USE`、サービスの`VIDEO`または`IMAGE_AND_VIDEO`、会員同意・契約・対応SNSを条件に決定的なProject IDを作り、30秒の字幕または画像カルーセル動画を準備する。失敗をログ化し文章・画像フローへ伝播させない。手動経路は `apps/web/src/http/video-project-create.ts`、`video-project-plan.ts:20-145`、`video-project-review.ts:40-110`、`video-project-ai-scenes.ts:22-110`、`video-project-render.ts`。企画の個別化は `packages/database/src/video-planning-context.ts` と `apps/web/src/providers/openai-video-plan-generator.ts` に実装があるが、商品/人格/履歴のすべてが期待どおり反映される本番品質は未確認。

`packages/database/prisma/schema.prisma:5148-5370,5563-5581,6254-6286` にVideoProject/Scene/SceneGeneration/Render/Delivery/Jobがある。ProjectはWorkspace/Group/Membership/Owner/BunshinとRevisionを持ち、RenderはProject+Revision、AI場面はProject/Scene Revision+Provider+Modelで一意。`packages/application/src/video-core.ts:95-315` に計画差し替え、場面編集、承認、完成レビュー。`apps/web/src/http/video-project-ai-scenes.ts:22-110` はFAL/RUNWAYを選択し既存Jobに登録、`apps/web/src/jobs/video-ai-scene-generation-job-handler.ts:21-70` は実Adapterと非公開保存に接続。`apps/web/src/providers/fal-kling-video.ts:54-130` と `runway-video.ts:42-155` は実API呼び出しコードであり、設計だけではない。最終合成は `apps/web/src/http/video-project-render.ts`、`apps/web/src/jobs/video-render-job-handler.ts:30-104`、`apps/web/src/providers/creatomate-video-render.ts`。写真・生成画像・AI動画・BGM・ナレーションを `packages/application/src/video-render-execution.ts:60-150` と `apps/web/src/video/prepare-video-narration.ts` で接続する。字幕と表示情報は構成/Provider側に含まれるが実MP4の品質は未確認。

`apps/web/src/http/job-worker.ts:55-140` は場面と合成を同じJob機構で処理し、Creatomate webhookとpolling回復経路を併用する（同:91-99、`video-render-webhook.ts:42-75`）。`packages/database/src/video-media-quota.ts:12-145` はService/Organization契約確認とRevision単位の予約/確定/解放を行う。AI場面には見積/実原価フィールド（`schema.prisma:5329-5365`）があるが、今回の `apps/web/src`・`packages/application/src`・`packages/database/src` 検索では `actualCostUsdMicros` をProvider請求から設定する経路を確認できず、`video-render-operations.ts:309-324` の管理者再試行は同フィールドを `null` に戻す。**実外部原価の不可逆記録が不足する可能性がある**。合成・計算・再試行を含む工程別実請求台帳の完全性も未確認。利用枠の返却と既発生外部原価は別管理が必要。

`apps/web/src/video/{fal-video-scene-output-storage,video-render-output-storage,video-asset-storage}.ts` は所有範囲付きStorage keyと期限付きURLを扱う。`schema.prisma:5220-5305` に期限/削除時刻がある。実Storage policy・保存期間の本番設定は未確認。`packages/application/src/video-render-completion.ts:44-187`、`apps/web/src/line/video-completion-messaging.ts:24-102` は通知の独立状態、retryKeyと一時アクセスURLを扱う。完了後に通知だけ再試行しても、`video-render-execution.ts:60-61` が成功済みRenderを返すため再合成しない構成。ただし障害注入での本番検証はない。OEMのGroup/Serviceスコープはあるが、素材権利/請求先/Provider原価のすべての分離は未確認。

### 実装状態（今回のコード確認と実運転を分離）

| 項目                           | コード存在 | 実行経路へ接続             | 単体・契約テスト   | 実Provider検証 | 本番E2E | 根拠                                                                                                                                                        |
| ------------------------------ | ---------- | -------------------------- | ------------------ | -------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily Mission→動画             | あり       | あり（条件付き）           | あり・今回成功     | 未確認         | 未確認  | `apps/web/src/services/automatic-daily-video.ts:118-312`; `apps/web/test/automatic-daily-video.test.ts`                                                     |
| 企画・場面編集・承認・レビュー | あり       | あり                       | あり・今回一部成功 | 該当外         | 未確認  | `packages/application/src/video-core.ts:95-315`; `apps/web/src/http/video-project-plan.ts:20-145`                                                           |
| fal/Kling・Runway場面          | あり       | あり（設定・契約条件付き） | あり・今回一部成功 | 未確認         | 未確認  | `apps/web/src/providers/fal-kling-video.ts:54-130`; `runway-video.ts:42-155`; `video-ai-scene-generation-job-handler.ts:21-70`                              |
| Creatomate合成                 | あり       | あり（設定条件付き）       | あり・今回一部成功 | 未確認         | 未確認  | `apps/web/src/jobs/video-render-job-handler.ts:30-104`; `apps/web/src/providers/creatomate-video-render.ts`                                                 |
| Job/Quota/Storage/LINE通知     | あり       | あり                       | あり・今回一部成功 | 未確認         | 未確認  | `apps/web/src/http/job-worker.ts:91-140`; `packages/database/src/video-media-quota.ts:12-145`; `packages/application/src/video-render-completion.ts:44-187` |

今回の安全なVitest実行：application 4ファイル36件、database 3ファイル15件、web 4ファイル43件、計94件成功。これは外部Provider/本番DB/実送信を使わないテスト。全スイート、build、実Provider、実MP4、LINE実送信、本番E2Eは未実行。

## OpenMontageの実行方式と追加価値

固定commitの[architecture](https://github.com/calesthio/OpenMontage/blob/08e2151fa02de28a5d6a312b3d575692bf147ad7/docs/ARCHITECTURE.md)は「IDE上のAIコーディングエージェントがYAMLとskillを読み、Python toolsを選択・実行する」方式を明記する。`setup.py` にPythonパッケージはあるが統一制作用 `console_scripts` はない。`backlot/__main__.py:1-95` のCLIはboardの`open/serve`、`backlot/server.py:170-290` のHTTP APIはhealth/project state/SSE/mediaの読み取りで、制作開始・キャンセルAPIではない。個々のPython toolは呼べる（`tools/video/video_compose.py:337-355`）が、全工程を安全に起動・完了判定するSaaS APIとは別。`pipeline_defs/cinematic.yaml:20-150` は提案・台本・sceneで人の承認を既定とし、エージェントによる研究・判断を前提にする。`lib/checkpoint.py:198-249,284-345,422-632` はProject別チェックポイント、原子的置換、既完了stage判定・人承認ゲートを実装する。ただし外部発注IDと請求の一意管理、同時テナント隔離、部分再試行の安全性は未確認。`tools/tool_registry.py` のプロセス環境`.env`読み込みと動的tool import、`tools/video/video_compose.py` の任意パス・subprocess・プロジェクト別Remotionソースは、SaaS取り込み前に強いsandboxが必要な根拠である。

| 機能                                          | 判定                     | 根拠・限界                                                           |
| --------------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| Board CLI/読取HTTP                            | 実コードあり             | `backlot/__main__.py`, `backlot/server.py`; 制作制御APIではない      |
| Python個別tool/Remotion/FFmpeg合成            | 実コードあり             | `tools/video/video_compose.py:337-355,1944-2135`; 依存未導入で未実行 |
| ステージチェックポイント/再開案内             | 実コードあり＋対話前提   | `lib/checkpoint.py:422-632`; 成功済み外部発注の再利用保証は未確認    |
| 企画・演出・品質レビュー                      | 対話前提                 | `pipeline_defs/cinematic.yaml` とskill; 無人運転には追加実装必要     |
| 統一制作CLI/書込HTTP API/ジョブ隔離・課金台帳 | 追加実装必要または未確認 | `setup.py`, `backlot` entry point, `tools/tool_registry.py` を調査   |

エージェント認証・契約・推論料金はホスト（Codex等）の条件に依存し、OpenMontage自体がSaaS無人運転用資格情報/課金を提供するとは確認できない。工程限定は個別tool呼出しなら可能だが、YAML全体を安全に切り分けるAPIは未確認。

固定commitの `tests/contracts/test_backlot_contract.py` はcheckpoint gate/history、project初期化、event、tool計測等を試験し、`tests/contracts/test_remotion_video_transition_contract.py` 等の構成契約も存在する。しかしOpenMontageのテストは今回実行しておらず、これらだけで外部Provider実発注、同時テナント隔離、agent無人完走、SaaS課金を証明しない。

## 要件差分表

分類：R=既存をそのまま再利用、E=既存拡張、N=新規、O=対象外/不要、U=未確認。根拠のOpenMontage側は上記固定commit。

| 要件                      | 現行実装と根拠                                                | OpenMontageの実装と根拠                                        | 差分                                | 分類 | 最小変更候補                  | 検証方法                  | 未解決条件             |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- | ---- | ----------------------------- | ------------------------- | ---------------------- |
| 個別化企画/台本           | `video-planning-context.ts`, `openai-video-plan-generator.ts` | cinematic YAML proposal/script skill                           | 演出の選択肢は増え得るが品質未測定  | E    | 現行企画評価を先行            | 同条件で人手修正数比較    | 権利・人格混入         |
| AI動画場面                | fal/Runway adapter＋Job、`video-ai-scene-generation.ts`       | video selector/tool群                                          | Provider機能は大幅重複              | R    | 既存を維持                    | 同一Revisionの再試行      | 二重発注防止           |
| 写真/画像/音声/BGM        | `video-render-execution.ts:60-111`                            | `video_compose.py:438-735` 等                                  | 素材接続は重複、表現差のみ仮説      | R    | 現行接続維持                  | 固定素材で比較            | 素材権利               |
| 高度な演出/合成           | Creatomate adapter                                            | Remotion/FFmpeg/atelier、`video_compose.py:933-1112,1944-2135` | 表現力の可能性、ローカル計算/保守増 | U    | PoC1計画のみ                  | 短尺合成の比較            | ライセンス・CPU/メモリ |
| 承認/Revision             | `video-core.ts:95-315`                                        | `checkpoint.py:284-345,422-632`                                | 状態正本が重複                      | R    | bunshinを正本に               | 承認済み入力のhash再現    | ステージ対応           |
| Job/状態照合              | `job-worker.ts:91-140`                                        | Backlot読取API/checkpoint                                      | OMに発注照合契約なし                | E    | 現行Jobで回復設計             | 応答喪失/逆順callback注入 | Provider照会API        |
| 利用枠/原価               | `video-media-quota.ts:12-145`、scene見積/実績                 | `tools/cost_tracker.py` 等                                     | 課金の正本はbunshinで維持           | E    | 外部発注台帳を検討            | 失敗でも実原価を保持      | 実請求照合             |
| 非公開Storage/通知        | `video-render-completion.ts`, storage adapters                | `projects/`成果物/Backlot媒体配信                              | 所有権/URL/LINEはOMに任せない       | R    | 現行を維持                    | 越境・期限切れ検査        | 保存/削除E2E           |
| 自動SaaS運転/隔離         | 認可・Jobあり                                                 | agent/skill対話と共有環境                                      | 安全な統一起動・終了・隔離が不足    | N    | 導入時のみadapter/sandbox設計 | 同時2ジョブ・悪意入力     | 契約/法務/保安         |
| SNS自動投稿/音楽生成/長尺 | MVP外                                                         | toolやpipelineあり                                             | 今回の価値判断に不要                | O    | なし                          | 該当外                    | 該当外                 |

OpenMontageの `tools/cost_tracker.py:41-174,487-506` はproject別JSONの見積/予約/精算を実装するが、bunshinのProvider請求・顧客利用枠・OEM請求の正本にはならない。

## A〜D比較と判断変更条件

| 案                 | 追加価値・重複                                    | 変更/無人実行/運用                          | 法務・原価・分離・OEM/切戻し                        | 判定                   |
| ------------------ | ------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- | ---------------------- |
| A 現行改善         | 新しい演出は増えないが既存経路の信頼性/品質を改善 | 最小変更、既存Job/Provider                  | 新ライセンス不要、既存原価/分離を維持、切戻し容易   | **推奨**               |
| B 本部社内制作補助 | 高度編集の学習・試作価値。通常生成は重複          | 人が介在、SaaS無人性を要求しない            | 社内のみでも素材/依存権利確認要。製品から切離し可能 | 法務確認後の別検証候補 |
| C 工程限定         | 高度合成等に絞れる可能性                          | Adapterだけでなく状態/隔離/成果物検査が必要 | AGPL/Remotion、実原価、OEM配布条件が未解決          | 現時点見送り           |
| D 独立Worker       | 技術隔離可能性                                    | 新キュー/インフラ/監視/長時間計算、最も重い | 別Workerでもライセンス解消せず、二重管理リスク      | 現時点見送り           |

品質/手直し・原価を同条件で測り、権利者/法務の判断、無人再開・同時隔離・二重発注防止が実証され、既存Creatomateでは満たせない具体的要求が出た場合にCを再評価する。Dは現行Jobと隔離実行で満たせない実測上の理由が出た場合のみ。Bは社内での権利/素材統制と人の承認を条件にする。

## 未確認事項

本番デプロイSHA・契約設定・鍵・Provider実接続・LINE実送信・Storage RLS/削除実効性・本番E2E・実料金/成功率・OEM契約/請求先・Remotion/FFmpeg実バイナリ構成・OpenMontageエージェント課金/無人権限・同時処理の安全性。今回これらを探索・実行していない。詳細は[リスク](OPENMONTAGE_LICENSE_AND_RISK_REVIEW.md)と[PoC計画](OPENMONTAGE_POC_PLAN.md)。
