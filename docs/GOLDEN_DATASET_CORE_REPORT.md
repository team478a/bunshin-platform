# Golden Dataset Core 実装報告

## ゴール

APIキーや実利用者データを使わず、将来のProvider／Model／Agent変更を同じ安全基準で比較できる最小基盤を作る。

## 実装

- version固定された合成fixture
- fixtureの実行時検証
- outcome、Provider失敗分類の比較
- data class allowlistとTool allowlist
- 禁止文字列、危険URL、最大結果件数
- 費用、遅延、再試行上限
- 固定violation codeを返す決定的評価器

## fixture範囲

- 日本語の小規模店舗
- Prompt Injection
- Cross Workspace／User／Bunshin相当の越境
- 医療の高リスク表現
- Provider rate limit
- 壊れた構造化出力

合成データだけを使用し、メール、LINE user ID、実Knowledge、Memory、投稿本文、APIキーを含めない。

## 非対象

- 外部API／AI／Agentの実行
- Provider品質の実測
- DB保存、管理画面、Job
- Prompt、Skill、Memoryの自動変更
- 本番Provider選定

## 次のGate

Golden Datasetを使うfixture-onlyのSchema／Policy回帰Runnerまで完了した。全件の合否と、欠落、重複、未知ケースを固定分類できる。

APIキー準備前に承認された範囲はここで完了とする。実Provider benchmark、共有Research Job、Provider Registry、Agent Adapterへは進まない。
