# HASSY SNS支援 H2-A 行動停止要因ルール実装報告

## 1. 調査した内容

- Daily Missionの配信、閲覧、採用、コピー、投稿完了、投稿結果の既存イベント境界
- `capability-social`内のDomain Ruleと公開APIの構成
- Workspace / Service / User / Bunshinを越境させないためのスコープ情報
- システム障害と利用者側の停止要因を混同しない観測条件

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier.ts`
- `packages/capability-social/src/index.ts`
- `packages/capability-social/test/activity-barrier.test.ts`
- `docs/DECISION_LOG.md`
- `docs/HASSY_BARRIER_RULES_IMPLEMENTATION_REPORT.md`

## 3. 主要な設計判断

### 行動ログだけでは確定しない

同じ行動停止でも、時間不足、操作方法、内容への不満、自信不足など複数の原因があり得ます。そのためルールが返す状態は`SUSPECTED`だけです。`CONFIRMED`は後続の本人確認でのみ成立させます。

### システム障害期間を除外する

入力集計はシステム障害期間を除いたものに限定します。有効観測日が0日の場合、候補を返しません。除外日数はEvidenceへ残します。

### 計測不足を効果不足と断定しない

投稿完了が記録され、Insightがない場合は`EFFECT`ではなく`UNKNOWN`を返します。まず計測可否を確認するためです。

### 証跡に本文を複製しない

Evidenceにはスコープ、観測期間、集計値、閾値、Rule Versionを保持します。回答、Memory、投稿本文は保存しません。

## 4. 実行した検証

- `pnpm --filter @bunshin/capability-social typecheck`
- `pnpm --filter @bunshin/capability-social lint`
- `pnpm --filter @bunshin/capability-social test`
- 18 test files / 130 tests passed

自動テストでは、代表的な行動停止、システム障害で有効観測日がない場合、決定性、スコープ維持、不正入力拒否を確認しました。

## 5. 未解決事項

- 既存イベントを障害時間除外済みの集計へ変換するRepository / Application実装
- 推定候補とEvidenceの永続化
- 本人への確認質問と`CONFIRMED` / `DISMISSED`遷移
- 確定した要因に対応する無料支援の提示
- クールダウンと再推定条件

## 6. 次Phaseへ進める条件

このPRのレビュー後、H2-Bとして既存イベントの集計、保存モデル、Workspace / Service / User / Bunshin isolation、冪等性を実装します。本人確認と支援提示はH3へ分離します。
