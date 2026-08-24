# Production Gate証跡管理 実装報告

## 1. 調査した内容

管理画面のProduction Gateは自動設定と人間確認を分離できていたが、人間確認を永続化する仕組みがなく、開始判定は常に確認待ちだった。

## 2. 変更した内容

- 対象commit、確認項目、確認/取消、理由、証跡URL、実施者、日時を追記型で保存する。
- 管理画面`/admin/production-gate`から確認と取消を記録できる。
- 同じcommitの最新イベントから現在状態を算出する。
- 全自動確認と全人間確認が有効な場合だけ「開始できます」と表示する。
- 最終承認は他の6項目が有効な場合だけ保存する。

## 3. 主要な設計判断

- Production以外では画面/APIを停止する。
- 対象SHAを利用者入力にせず、Vercelの配備commitからサーバー側で確定する。
- 更新はSUPER_ADMINだけに許可する。
- 証跡URLはHTTPSのGitHub、Vercel、Supabaseだけを許可する。
- 証跡を削除・上書きせず、取消イベントを追加して監査履歴を残す。

## 4. DB変更

- `ProductionGateEvidence`
- `ProductionGateCheckKey`
- `ProductionGateEvidenceAction`
- Migration `20260824233000_add_production_gate_evidence`

## 5. 未解決事項

- 本番Migrationの適用
- 実際の復元訓練、端末smoke、退会dry-run、LINE Go/No-Go
- 各結果の証跡登録と責任者の最終承認
