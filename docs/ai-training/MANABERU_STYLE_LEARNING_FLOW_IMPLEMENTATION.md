# マナベルスタイル — 学習・評価・再開導線 実装報告

基準main: `3846902fc4ba24063911a3cdc099a3d7461ee070`。branch: `codex/manaberu-learning-line-bridge`。commit/PRは本PRの履歴を正本とする。

## 修正した実際の学習停止

既存Pilot UIは回答POST→評価POSTがPENDINGを返すと結果を取得せず、再訪しても評価を復元しなかった。結果画面の「次の課題を見る」へ進めない不具合を修正した。

- 回答は既存APIへ保存し、既存Assessment jobを明示操作で開始。
- 既存の認証付き評価GETで即時確認、その後最大16回/2秒間隔でPENDINGを確認。各fetchは10秒で中断。
- READYで結果・改善点・次の学習CTAを表示。GETした結果でのみ完了状態を扱い、UNKNOWN/通信失敗をPASSにしない。
- FAILEDは自動再実行せず、本人の再試行操作のみ既存POSTへ接続。PENDING/READYの手動「評価状況を確認」はGETだけ。
- 同じ回答の評価を再訪/再読み込み後もGETで復元。Assignment変更/ページ離脱でabortし、遅れた旧課題の結果を破棄。
- 実践完了UIはREADYだけでなく取得済みPASSを必要とし、REVIEWを完了申告へ誘導しない。保存時の既存Evidence検証も維持。
- Plan完了後は過去評価を再表示して次Assignmentへ誘導しない。
- LINE接続画面に「学習を始める・続ける」CTA。認証付き既存Program一覧へ接続。

## 学習の実体

PROMPT_STRUCTURE / CONTEXT_SETTING / CONSTRAINT_SETTINGの3Definitionのみ。Goal/Plan確認→Router→既存Mission手順/ヒント→本人が自分のAI Toolを操作→指示を回答→既存Assessment→改善/復習/次Definitionへ進む。外部AIの完成品を代行生成しない。

既存Guided Practiceに支援方法・本人操作/確認・本人完了申告を記録し、既存First Success/Capability Evidenceを使用する。未承認Definitionを昇格しない。能力Levelを自己申告だけで確定しない。

## 検証

- Observer unit: PENDING→READY、FAILED、最大16回、離脱後の遅延結果破棄、timer cleanup、認可/通信失敗。
- `pnpm test:learning-ui`: e2e runner + Chromium、390×844。Productionと同じPilot/Mission/Evaluation componentsを隔離Vite harnessに表示。
- ブラウザーAPIは合成scopeをroute mock。手順/ヒント→本人操作→回答→非同期評価→実践完了→First Success→次課題、再読込復元、FAILED明示retry、403停止、PENDINGの手動GET、Plan完了後の旧評価非表示、REVIEWで完了申告不可の7ケースを検証。
- CI verifyにもbrowser suiteを追加。Root typecheck/lintはharnessも検査する。
- 新e2e/ViteはdevDependencyのみ。モデル・AI subscription・実Provider不要。harnessはlocalhost専用、Production routeなし。相談/回答を実サービスへ送らない。
- 既存HTTP/Pilot gate/Provider gate/LINE隔離/評価Worker/LINE接続を回帰確認。Web 3,056件成功/2件skip、application 861件成功、capability-training 288件成功、database unit 900件成功、Observerを含む対象13file 152件成功、ブラウザー7件成功、architecture 10件成功。
- Web typecheck、harness strict typecheck、変更箇所/harness lint、architecture check、format check、Web build成功。CIの最終結果はPR本文とCI履歴へ記録。テスト用依存を追加し、既存のruntime Zod/Vite解決版は維持する。

これはクライアントのLearning Loop検証であり、本番認証・実DB・実ProviderによるE2E成功の証明ではない。Backendの既存テストとは区別する。

## 変更しない境界 / 残作業

DB/schema/migration、Provider、旧30日Runtime、LINE scheduler、Seat/allowlist、Definition approval、費用制限、START/STOPは変更しない。本文をAnalytics/Profileへ追加保存しない。

[本番照合](MANABERU_STYLE_LEARNING_PRODUCTION_RECONCILIATION.md)参照。本番は#1181未公開・参加中0人。実運用開始はRelease/DB/Approval/本人参加/実端末/実Providerの別Gate。通知自動配信は稼働済みと扱わない。

Rollback: 本PRのUI/observer/CTA変更をrevert。新migrationなし、Goal/Plan/Answer/Evidence削除不要。Pilot停止やProduction rollbackは別承認。
