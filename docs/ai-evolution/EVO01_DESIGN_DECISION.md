# EVO-01 評価基盤の設計判断

2026-10-09。基準main: `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`。
ユーザーのPhase 2 EVO-01指示を実装範囲の承認とする。#1188は着手時OPEN（database CI成功、verify実行中）。監査版 `41daf16848308051baa548384855b8594eb2b8b2` の6文書を参照するが、このPRへ複製/mergeしない。最新mainは監査基準と同一で、対象Runtimeの差分はない。

## 判断

既存公開PackageとWeb Adapterをテストから再利用する。新Core/package/Provider/DBは作らない。`apps/web/test/ai-evolution`へ固定合成データ、オフライン実行、JSON/Markdown report/比較を置く。

必須検査はfixtureの明示oracleと既存検証を組み合わせる。出力の意味の全自動判定は行わず、有限の語句制約は合成fixture専用とする。実認可・契約・Pilot Gateは別の既存HTTP/worker回帰を維持し、Adapter単体のPASSを認可成功と扱わない。reportに未測定必須範囲とrelease判断UNKNOWNを残す。

失敗を含む固定出力の検査結果（observed PASS/FAIL/UNKNOWN）と、それを期待どおり検出したテスト結果を分離する。負例のFAILを隠さない。モデルIDはmock envelope/requestの識別であり実呼出し証拠ではない。latency/token/cost/error rate/model品質は常に未実測。

履歴は新しい評価IDの専用ディレクトリへ排他的に作成する。レビューは別の追記recordにし、既存reportを上書きしない。dataset版と内容digest、rule版、case集合が違えば比較不能。model/Prompt差は比較対象として表示する。人間reviewなしにモデル更新・deployを認可しない。

参考: [OpenAI Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) の目的・dataset・指標・比較の分離を参考にした。公開Evals APIへの依存・接続は追加しない。
