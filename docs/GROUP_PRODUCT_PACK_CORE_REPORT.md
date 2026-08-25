# G2-A 公式商品パック Core 実装報告

## 完了範囲

- Product Pack / Version / Rule / Asset / Bunshin Assignment
- 公開済みVersionの上書き禁止と旧VersionのSUPERSEDED化
- 1 Packにつき公開Version最大1件、1 BunshinにつきACTIVE Assignment最大1件のDB制約
- Organization Workspace OWNER / ADMINだけがPackを管理
- ACTIVEなGroup参加と本人同意があるBunshinだけ割当可能
- 退出・別Workspace・別User・未公開Versionの利用拒否
- 生成時に固定Versionを参照できるAssignment構造

## 次の範囲

G2-Bで管理API/UI、一覧・詳細、Pack停止、Generation Context Builderへの解決処理とSnapshot固定を実装する。
