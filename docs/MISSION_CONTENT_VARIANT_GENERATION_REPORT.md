# Daily Mission 別案生成 実装報告

## 1. 調査した内容

- Daily Mission生成時のGeneration Context Snapshotと、現在有効なWorkspace、User、Bunshin、Serviceの権限境界
- 承認済みSNS設定、戦略、週次計画、Content Pillar、Personality、Knowledge、Memory、Campaign、公式資料の再取得方法
- 専用URLのコピー可否、広告表現審査、Campaign重複審査、組織・サービス別AI生成枠、AI利用量記録

## 2. 変更したファイル

- `packages/capability-social/src/index.ts`
- `packages/capability-social/test/mission-content-quality.test.ts`
- `apps/web/src/providers/openai-mission-content-generator.ts`
- `apps/web/src/services/mission-content-variant-generation.ts`
- `apps/web/test/openai-mission-intelligence.test.ts`
- `apps/web/test/mission-content-variant-generation.test.ts`
- `docs/REMAINING_FEATURE_IMPLEMENTATION_PLAN.md`

## 3. 主要な設計判断

- 別案は元MissionのGeneration Context Snapshotに記録されたIDと版を基準にし、現在も同じ利用者が参照可能で有効な資料だけを再取得する。
- 元Missionのコピーが現在許可されない場合は生成前に停止する。生成内容に含まれるURLをすべて除去し、元Missionで承認済みのURLがある場合だけ同じ配置先へ戻す。
- AIへ原案と変更条件を渡し、導入、構成、具体例、言葉選びを変える。原案とのSimHash類似度が85%以上なら保存しない。
- Campaign投稿は現在有効なCampaignとProduct Packを再解決し、既存のCampaign重複審査と広告表現審査を再実行する。
- 生成と品質審査は組織・サービスのAI枠を呼出し単位で予約し、モデル、Prompt Version、token、固定リクエスト原価、処理時間、成功・失敗を記録する。
- 初期上限は元Missionにつき1案とし、Daily Missionが1日1件である現在のMVPではBunshinごとの日次上限も1案になる。

## 4. 実行した検証

- Capability Socialの型検査、Lint、対象テスト
- Webの型検査、変更ファイルのLint、OpenAI Providerと別案安全処理の対象テスト
- 同一内容の検出、未承認URLの除去、承認済みURLの復元、元配置が見つからない場合の停止を自動テスト

## 5. 未解決事項

- 利用者向けAPIと「別の案を見る」「この案を使う」「内容を直す」UI
- 30 WPの予約、生成失敗時の解放、生成成功時の確定
- 本番Migration適用と実端末確認

## 6. 次工程へ進める条件

本変更のCIとレビューが完了した後、個人画面とサービス画面のAPI/UIから生成サービスへ接続する。
