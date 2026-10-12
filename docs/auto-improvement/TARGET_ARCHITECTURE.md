# 推奨アーキテクチャ

## 採用提案

既存の `platform-domain → application → database / capability adapter → web composition` を維持する。新しい巨大な監視/自動開発サービスを本番アプリへ埋め込まない。これは設計提案であり、今回Port・DB・API・Jobを実装していない。

Provider交換は、入力・出力・安全境界・評価をワタシワークスが所有し、実行Adapterだけ交換することで実現する。ChatGPT/Codex/OSSの進化は版固定の合成評価で試し、人間承認後に採用する。特定サービスのアカウント操作や非公開APIに依存しない。将来のCodex接続手段・利用条件はPhase 3前に別確認する。

## 二つの処理系

```text
本人の利用 → 本人/自Bunshinの業務正本 → 既存企画/学習Runtime → 次の本人支援
                       │（認可済み限定読取）
                       ▼
                scope別Observation Adapter
                       ▼
      Coverage / Privacy projection / Rule detection
                       ▼
             根拠付きCandidate → 人手確認
                       ▼（別の開発承認・外部送信審査）
                脱識別Evidence Bundle
                       ▼
       原因仮説/再現条件/改善案 → 承認済みIssue
                       ▼
          隔離Repair Runner → 固定CI → Draft PR
                       ▼（人間レビュー/merge/release承認）
             production基点release → 効果観測
```

本人支援は既存権限内で履歴を参照する。システム改善は本人の人格・Memory・企業原稿・回答を外へコピーしない。改善結果も本人の人格/Memoryへ無断配布しない。個別支援の自動化がコード修正の承認を意味しない。

## コンポーネントと責務

| 境界        | 再利用／将来追加                                                             | 権限・永続化                                                                                              |
| ----------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source      | AiUsage/Job/Mission/Program/Feedback/既存商用正本                            | 本番の既存書込のみ。改善収集のために請求台帳へ書かない                                                    |
| Collection  | CollectImprovementObservationsと既存Adapter。研修/技術/採否Adapterは追加候補 | Serviceごとに現在権限・原本scope・時点・版確認。read-only、最大件数とPARTIAL維持                          |
| Detection   | 固定ルール、BuildImprovementFeedbackReviewEvidence、候補CAS/失効             | 既存候補はSOCIAL Feedback専用。別sourceを現在表へ無理に詰めず、契約を設計後に最小拡張                     |
| Proposal    | 新しいAnalysis Portと固定DTO                                                 | 本番DBアクセスなし。仮説・反証・対象path・期待効果・費用・不確実性。自動承認しない                        |
| Repair      | `RepairRunnerPort`案。Codexを最初の人手起動候補、OpenHands SDKを代替候補     | disposable sandboxとsource snapshotのみ。AIへの本番secret、DB/Storage/メール/LINE/SNS接続なし             |
| Publication | GitHub Broker案                                                              | Runnerはpatch/reportを返すだけ。Brokerが限定repo/branchのIssue/Draft PRを作る。merge/deploy/admin権限なし |
| Release     | 既存CI・release手順                                                          | main/production差分を毎回確認。production基点、移行の別承認、人間による停止/切戻し                        |
| Effect      | 既存EVO report/業務指標を接続するEffect Reader案                             | release別・Service別、同じルール/母数/観測窓。INCONCLUSIVEを許容                                          |

CoreにOpenHands/Langfuse等のSDK型を漏らさない。database/web以外からPrismaやprovider実装を直接呼ばない。既存package exportsを利用する。

## 提案データ契約

### 内部Observation

既存6要素scope（tenant/workspace/service/package/adapter/environment）、原本参照、時刻、固定code、版、read completenessを保持する。UserとBunshinは別参照であり、参照IDは匿名情報ではない。

母数は「対象attempt」「閲覧した提案」「判断した提案」「実践開始者」など定義を版管理する。該当しない母数はnull。サンプル率・除外・limit+1・読取期間を記録し、不完全結果の率・合計を確定値にしない。環境stampのない原本からproductionを推測しない。

### 外部Evidence Bundle（追加案）

allowlist: opaque caseRef、コード/ルール版、release/base SHA、対象component/処理段階、固定error分類、集計値と完全性、合成再現入力、期待動作、許可変更path、事前承認budget。本文由来hash・User/Bunshin/Workspace/OEM ID・原本IDは外へ出さない。scopeの対応表は信頼境界内に留める。

禁止: Prompt/回答/会話/Memory/企業情報/メール/電話/写真/URL query/署名URL/cookie/header/secret/provider raw response/任意stack。stackが必要なら自repoのfile/line/codeだけを固定版から生成する。任意自由文は選択codeへ落とし、判断不能なら人手対応。

正規表現マスキングだけで保証しない。余剰fieldはreject、未知formatはdropではなくBLOCKEDとして監査。各exporter・agent transcript・GitHub本文・CI artifactも同じ審査対象。公開Issueへ顧客由来情報を出さない。合成再現ができなければ自動修正候補から外す。

### Improvement Run（追加案）

caseRef、fingerprint/ruleVersion/evidenceRevision、承認者/時刻/許可範囲、base SHA、runner/provider/model/prompt版、attempt、cost/time/egress、artifact digest、tests before/after、Issue/PR/release参照、effect判定を保持する。既存候補の「確認済み」は開発承認に変換しない。

状態例: DETECTED → HUMAN_CONFIRMED → DEVELOPMENT_APPROVED → REPRODUCED → PATCHED → CI_VERIFIED → PR_CREATED → HUMAN_RELEASED → OBSERVING → EFFECT_CONFIRMED / INCONCLUSIVE / REGRESSED。
独立終端: BLOCKED、FAILED、CANCELLED、STALE。根拠/承認/base変更で旧runを再開せず再審査する。これは既存Triage stateを変更する指示ではない。

## 必須安全策

1. 収集はread-only。改善Runnerが本番DBへ自動writeできる経路を持たない。Proposal/Candidate保存も既存アプリ権限の範囲で別承認された接続だけ。
2. disposable container/VM、専用worktree、非root、CPU/RAM/disk/時間上限、production mount/host socketなし。worktreeだけではsandboxにならない。
3. 依存downloadと推論先はallowlist/proxy制限。Node install script、shell、生成テストも攻撃面。隔離DBの合成fixtureのみ、外部送信禁止検査をCIで行う。
4. AIはログ/Issue/コード中の命令を信頼しない。policyはsandbox外で強制し、agentの指示遵守だけに依存しない。
5. budgetは提案段階未承認。費用UNKNOWN・保存不整合・予約上限・期限超過なら停止。provider retryとagent retryを合算し、resumeで費用上限をリセットしない。
6. case fingerprintはscope+environment+source/rule+normalized固定症状。候補cluster、run lease/CAS、唯一のactive PR mappingで重複防止。応答喪失時はGitHub側のcase markerで照合し、推測で再作成しない。
7. 初期対象は局所の再現可能な不具合。auth/RLS/課金/OEM/DB migration/CI/deploy/secret変更は自動対象外。変更path、差分量、依存変更を外部validatorが確認。
8. 修正前に既存baseで再現FAIL、修正後PASS。既存テスト・assertion・安全gate削除/skip/緩和は禁止。AI作成テスト以外の固定oracle、既存回帰、既存通常CIが必要。
9. Brokerのtokenはagentへ渡さない。短期・対象repo限定、Issue/PR作成のみ。workflow secretやprod tokenをCIの修正runへ引き継がない。
10. PRは未信頼コード。保護ルール・人間レビューを維持し、`pull_request_target`等でsecret付き実行をしない。自動merge/deployは追加しない。

## 効果測定と切り戻し

deployが人間承認された場合だけ、変更SHA/Prompt版・観測開始/終了・同Service cohort・指標定義版・欠測・価格版を結び付ける。処理成功率、p95、採否/投稿率、本人実践、原価既知subtotal/UNKNOWNを別指標にする。小集団・期間不足はINCONCLUSIVE。

安全違反・誤合格・情報混入は件数が少なくても停止候補。採用率上昇だけで品質向上・本人能力向上・因果効果を断定しない。新規/既存ユーザー、季節、campaign、同時変更の影響を明記する。

Runner kill switchは新規dispatch停止、実行cancel、egress/token失効、patch隔離。既存本人支援を改善ジョブの失敗に同期依存させない。製品rollbackは人間が既存production release手順で前版へ戻す。DBの復元や原本/監査削除は自動実行しない。互換性不明なら停止して個別手順をレビューする。
