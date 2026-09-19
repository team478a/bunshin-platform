# Productionブランチ・デプロイ方針 実装報告

## 1. 調査した内容

- GitHubの`main`と`production`が同じcommitを指していること
- Vercel Git連携の自動デプロイ対象
- 現在のデプロイ手順とProduction環境の分離方針

## 2. 変更したファイル

- `apps/web/vercel.json`
- `apps/web/test/production-deployment-policy.test.ts`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/PRODUCTION_BRANCH_DEPLOYMENT_POLICY_REPORT.md`

## 3. 主要な設計判断

- VercelのGit連携デプロイは`production`ブランチだけ許可する。
- `main`、Pull Request、その他の作業ブランチはVercel Deploymentを作成しない。
- 開発統合先は`main`、本番公開先は`production`として分離する。
- 公開は`main`から`production`へのPull Requestで行い、直接pushとforce pushを運用上禁止する。
- Vercel管理画面のProduction Branchはリポジトリから変更できないため、初回切替手順として明記する。

## 4. 実行する検証

- `vercel.json`のJSON構文確認
- `production`だけが自動デプロイ対象であることの単体テスト
- Webのlint、型検査、テスト
- Git差分と作業ツリーの確認

## 5. 未解決事項

- Vercel Project SettingsのProduction Branchを`production`へ変更する操作は、管理画面で実施する必要がある。
- 切替後、`main`更新ではDeploymentが作成されず、`production`更新だけでProduction Deploymentが作成されることを実運用で確認する。

## 6. 次Phaseへ進める条件

- 本PRを`main`へマージする。
- Vercel管理画面のProduction Branchを`production`へ変更する。
- `main`から`production`への初回リリースPRを作成し、Production Deploymentを確認する。
