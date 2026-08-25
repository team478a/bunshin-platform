# G3-A 本人Evidence・広告安全性 Core Report

## 調査

G1の参加同意、G2のProduct Pack公開Version・Assignment・Generation Context接続を確認した。既存Trend Evidenceは市場情報の出典であり、本人の利用経験や成果の根拠には使用しない。

## 実装境界

- 本人EvidenceはPersonal Workspace / User / Bunshinで分離する。
- Product Packの公式事実とルールはOrganization Workspace所有の公開Versionを正本とする。
- 広告分類、本人根拠の要否、使用する公式事実を構造化入力として受け取る。
- `#PR`、必須表記、禁止表現、条件付き表記、公式事実を決定的に検査する。
- 投稿本文は監査へ保存せず、SHA-256 hashと判定根拠だけを保存する。
- 本部画面には商品関連の判定結果だけを表示し、個人Evidence本文と投稿本文を表示しない。

## 今回含めないもの

Campaign、一斉配信、Weekly Planの商品比率、類似検査、自動人格学習、法務助言、AIによる意味推測は含めない。Daily Missionへの自動Gate接続はG5で分類入力が確定した後に行う。
