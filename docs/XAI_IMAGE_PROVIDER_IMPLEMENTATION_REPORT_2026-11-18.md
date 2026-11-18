# xAI画像生成Provider 実装報告（PR-02）

更新日: 2026-11-18

## 1. 実装した機能

- 既存 `SocialImageAssetGenerationProviderPort` に接続する xAI Adapter を追加した。
- `grok-imagine-image-2.0` の画像生成と画像編集を、xAI公式のJSON APIへ接続した。
- 生成時は `3:4`、`1k`、`medium`、`b64_json` を指定し、取得画像を検証してPNGへ正規化する。
- 既存の画像Pilot設定で `OPENAI` / `XAI` を選択できるようにした。
- Provider、model、quality、Provider設定版を画像生成Requestへスナップショットし、再実行中の設定切替によるProvider混在を防いだ。
- Provider設定へ用途キーを追加し、画像、動画、共通処理の有効設定を分離した。
- 画像生成前の既存原価予約、日次・月次予算、組織生成枠、Job冪等性をxAIでも再利用した。
- 生成成功・失敗を既存 `AiUsageEvent` へProvider別に記録し、予約を必ず精算する。
- xAI障害を認証、rate limit、content policy、不正入力、Provider障害、不正レスポンスへ固定分類した。
- 既存のSupabase非公開Storage、1080×1350文字合成、品質確認、履歴、ページ再生成を維持した。

## 2. 再利用した既存機能

- `SocialImageAssetGenerationProviderPort`
- Social Image Generation Job / Claim / retry / failure処理
- `ManagedSocialImageRenderer` による1080×1350の文字合成
- `SupabaseSocialImageStorage`
- OpenAI画像品質レビュー
- `AiProviderConfiguration`、暗号化APIキー、接続確認、停止
- `AiProviderCallAdmission`、`AiUsageEvent`、予算上限
- Organization生成枠、Pilot利用権限、Workspace / Group / User / Bunshin分離

OpenAI画像生成は削除していない。xAIが停止または未設定でも、PilotをOpenAIへ戻せる。

## 3. 追加・変更した主なファイル

- `apps/web/src/providers/xai-social-image-generation.ts`
- `apps/web/src/jobs/social-image-generation-job-handler.ts`
- `apps/web/src/http/social-image-page-revisions.ts`
- `apps/web/src/ai/runtime-provider-configuration.ts`
- `apps/web/app/(app)/admin/ai/provider-configuration-editor.tsx`
- `apps/web/app/(app)/admin/images/image-pilot-settings-form.tsx`
- `packages/application/src/ai-provider-configuration.ts`
- `packages/application/src/social-image-generation-job.ts`
- `packages/database/src/provider-configurations.ts`
- `packages/database/src/social-image-generation-execution.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261118020000_xai_image_provider/migration.sql`
- 関連するUnit / Repository / HTTPテスト

## 4. DB・API・管理画面への影響

### DB

- `AiProviderKey` に `XAI` を追加した。
- `AiProviderCapabilityKey` を追加し、Provider設定の一意性を `environment + provider + capability + version` に変更した。
- 既存FAL / Runway設定を `VIDEO_SCENE_GENERATION` へ移行する。
- 画像Pilotへ `asset_provider` を追加する。
- 画像Requestへ `asset_provider`、`asset_model`、`asset_quality`、`provider_configuration_id` を追加する。
- 既存画像Requestは所属PilotからProvider / model / qualityをbackfillする。

### API・Job

- 既存画像生成APIの外形は維持した。
- Job Claim時に、RequestのProvider・modelと一致する確認済み有効設定を固定する。
- OpenAIは既存 `GENERAL` 設定を互換fallbackとして利用できる。xAIは画像用途設定を必須とする。

### 管理画面

- 既存AI Provider管理にxAIと用途選択を追加した。
- 既存画像Pilot設定に画像Provider選択を追加した。
- xAIの見込額初期値は、1K・medium出力 `$0.06` と参照画像入力 `$0.01` の上限見込みとして `$0.07` とした。値は設定版で変更でき、Domainへ固定していない。

## 5. 公式仕様の確認結果

2026-11-18時点のxAI公式資料を確認した。

- model: `grok-imagine-image-2.0`
- endpoint: `/v1/images/generations`、`/v1/images/edits`
- response: URLまたは `b64_json`。永続保存には `b64_json` を使用する。
- resolution: `1k` / `2k`
- quality: `low` / `medium` / `auto`
- 画像編集: JSONのdata URIで参照画像を渡せる。最大5参照画像だが、今回は既存Portに合わせて1枚を利用する。
- rate limit: Tier 0で6 RPS。既存Jobキューを利用し、新しい根拠のない一律制限は追加していない。
- pricing: 1K medium出力 `$0.06/image`、画像入力 `$0.01/image`

参照:

- https://docs.x.ai/developers/models/grok-imagine-image-2.0
- https://docs.x.ai/developers/model-capabilities/images/generation
- https://docs.x.ai/developers/model-capabilities/images/editing
- https://docs.x.ai/developers/model-capabilities/images/prompting-guide
- https://docs.x.ai/developers/rate-limits
- https://docs.x.ai/developers/pricing

## 6. テスト実施結果

- `pnpm typecheck`: 成功（25/25 tasks + learning UI）
- `pnpm lint`: 成功。Architecture boundary check成功。既存4 warning、error 0。
- Application Unit: 155 files / 1,242 tests 成功
- Database Unit: 241 files / 1,401 tests 成功
- Database Integration: 1 file / 432 tests 成功
- xAI Adapter / Provider設定 / Admission / 接続確認のモックテスト: 成功
- `pnpm build`: 成功（13/13 tasks、Next.js production build成功）
- `git diff --check`: 成功
- 全Web Test: 588 files成功、3 files skip、4,377 tests成功。既存 `daily-missions.test.ts` の2件だけが全体並列時に5秒timeoutしたが、同ファイル単独実行では10/10成功した。
- `pnpm format:check`: ローカルのignored `.pnpm-store` と既存 `.github/workflows/production-line-go-no-go.yml` を走査して失敗。変更ファイルはPrettier適用済みで、schema全体の不要な再整形は除去した。

外部APIはモックのみで、実xAI APIは呼び出していない。

## 7. 本番で利用できる範囲

コード実装済み、モック検証済み、隔離DB migration検証済みである。

本番反映済み、実API検証済み、実運用確認済みではない。本番利用にはmigration適用、xAI設定版登録、接続確認、Pilot切替が必要であり、いずれも承認後に行う。

## 8. 未実装・未検証項目

- xAI実APIによる品質、処理時間、実課金、rate limitの検証
- OpenAI / xAIの20題材比較（PR-03）
- 自動Provider選択（PR-03）
- xAI動画Provider（PR-04）
- Remote MCP / Grok Bot接続（PR-05 / PR-06）
- xAIの複数参照画像対応。既存UIとPortが1参照画像のため今回対象外。

## 9. 残るリスクと適用・復旧

- 公式価格・model仕様は変更され得る。実行前に管理設定のmodelと見込額を公式情報へ合わせる必要がある。
- 実API品質は未検証のため、xAIを本番Pilotで有効化しない限り既存OpenAI経路へ影響しない。
- migrationはenumと列を追加するため、復旧時はxAI設定とPilotを停止しRuntimeを前版へ戻す。既存データ保護のため追加enum・列を即時削除しない。
- migration適用前のRuntime切替は禁止する。適用後は既存OpenAI Requestをbackfillし、OpenAI互換fallbackを維持する。
- 全体並列時だけ再現する既存Daily Missionのtimeoutは本PR変更領域外。CI結果でも再確認する。

## 10. 次のPR

PR-03で、OpenAI / xAIの生成済みfixture、20題材の評価セット、決定的なProvider選択規則、比較・運用管理を実装する。実API比較は費用提示と承認後に行う。

PR URL: 作成後に追記する。
