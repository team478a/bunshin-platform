# Codex 最初の実行指示

以下をCodexの最初の作業指示として使用してください。

---

`AGENTS.md` と `docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md` を全文確認してください。

今回の作業はPhase 0だけです。本格的な機能実装、DB migration、UI構築、SNS投稿生成、LINE配信実装は開始しないでください。

新しい本体リポジトリは `team478a/bunshin-platform` です。

途中まで開発されているブログ版 `stockbusiness/bunshin-blog` は捨てず、将来の `BLOG` Capabilityとして再利用する方針です。実際のコードを調査し、推測ではなくファイルパスと実装根拠に基づいて分析してください。

BUNSHIN Platformの絶対条件は次です。

- 1 Userは複数Bunshinを所有できる
- UserとBunshinを同一視しない
- Bunshinごとに目的・人格・知識・Memory・Mission・Performanceを分離する
- SOCIALとBLOGはCapabilityとして分離する
- Provider依存をCoreへ混ぜない
- 既存ブログ版を無条件に全面リライトしない

Phase 0の成果物として、次の3ファイルを作成してください。

1. `docs/CURRENT_SYSTEM_AUDIT.md`
2. `docs/REUSE_MAP.md`
3. `docs/TARGET_ARCHITECTURE.md`

各文書には次を含めてください。

### CURRENT_SYSTEM_AUDIT.md

- 技術スタック
- ディレクトリ構成
- 実装済み・部分実装・未実装の機能一覧
- 認証、LINE、AI、scheduler、DB、WordPress、管理画面、CI/CD
- セキュリティと技術的負債
- 判断根拠となるファイルパス

### REUSE_MAP.md

各機能・moduleを以下に分類してください。

- REUSE_AS_IS
- REFACTOR_TO_SHARED
- KEEP_AS_BLOG_CAPABILITY
- REIMPLEMENT
- REMOVE
- UNKNOWN

移行先、理由、依存、リスクも記載してください。

### TARGET_ARCHITECTURE.md

- Multi-Bunshin Core
- Owner KnowledgeとBunshin Memory
- Capability Contract
- SOCIAL / BLOG境界
- Provider Adapter
- tenant/data isolation
- API、Job、DB、module構成
- 既存ブログからの段階移行案
- Phase 1の具体的な作業範囲

最後に、次をチャットで報告してください。

1. 調査したリポジトリ・ブランチ・コミット
2. 作成した文書
3. 主要な発見
4. 最大のリスク
5. 推奨する移行方式
6. Phase 1へ進む前に人間が判断すべき項目

Phase 0の文書を作成した時点で停止し、Phase 1の実装は開始しないでください。

---
