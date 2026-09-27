# ハッシー SNSサポート V1 H1 初期設定簡略化 実装報告

## 1. 目的

事業者向けサービスが、初回に5項目だけで開始できる設定を追加する。既存Serviceは従来の入力を維持し、ハッシー等の対象Serviceだけが運営設定から有効化できる。

## 2. 変更前

Business Profileを使うServiceでは、業種、会社名、商品、対象顧客、目的に加え、事業の特徴と投稿Toneも初回必須だった。Service固有の追加質問もすべて初回回答が必要だった。

## 3. 変更後

- Service運営設定へ「通常入力」「かんたん5項目」を追加した。
- かんたん設定では業種、会社名、商品、対象顧客、目的だけを初回表示する。
- Service固有の追加質問は「まだ回答していません」として保存し、既存`nextOnboardingRefinement()`が利用開始後に1問ずつ案内する。
- 地域、特徴、Webサイト、価格、Tone、必須・禁止事項は初回画面から外す。
- Bunshin作成に必要な特徴とToneは安全な初期値で補完する。
- 既存Serviceは保存値がなくても`FULL`となり、画面・validationは変わらない。

## 4. 適用境界

サービス名やslugのハードコードは使用しない。Serviceの`registration.onboardingConfig.businessProfileInputMode`が`MINIMAL`の場合だけ適用する。

## 5. 変更ファイル

- `apps/web/src/services/service-onboarding-settings.ts`
- `apps/web/src/http/service-settings.ts`
- `apps/web/src/http/service-onboarding.ts`
- `apps/web/app/s/[serviceSlug]/manage/settings/service-settings-editor.tsx`
- `apps/web/app/s/[serviceSlug]/manage/settings/service-onboarding-fields.tsx`
- `apps/web/app/s/[serviceSlug]/onboarding/page.tsx`
- `apps/web/app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx`
- 関連テスト

## 6. DB / Migration

変更なし。既存のVersioned onboarding JSON設定を利用する。

## 7. 検証

- 関連Vitest 30件成功
- Web typecheck成功
- Web lint成功
- Prettier成功
- `git diff --check`成功

## 8. 残課題

- H2 Barrier Coreは未実装。
- 追加質問の表示cooldown・dismiss履歴はH2/H3で扱う。
- ハッシー本番Serviceで`MINIMAL`を有効化する操作は、デプロイ後に対象を確認して実施する。
