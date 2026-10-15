# OSS・研究成果比較

## 結論と調査方法

2026-10-12 JSTに公開repository、実source、license、公式docs、原著研究を読取調査した。インストール/契約/実行/外部AI比較はしていない。実装接続の適合性・導入工数は本監査の推論であり、bunshin上のPoC結果ではない。

初期は既存Engine/監視/EVO評価を使う。コード修正は人手起動Codex候補の交換可能Portを設計し、OpenHands SDKを第二候補とする。Langfuse/SigNoz一式は現在の不足を直接解消しないため後回し。SWE-agent/Agentlessは評価設計の参考、Aiderは開発者の補助候補。

## Source固定

GitHub APIで確認したdefault branchのSHA。docs/価格/外部サービス条件は変わり得るので採用前に再確認する。

| Repository                   | branch / SHA                                    |
| ---------------------------- | ----------------------------------------------- |
| OpenHands/OpenHands          | main `0f1b6f62507f1ccdb4e63f61cf3dc48356a0d4fa` |
| OpenHands/software-agent-sdk | main `e3a26821f8f7c85e98078c7b5e1a80647fc7d0c7` |
| SWE-agent/SWE-agent          | main `3ea751c087f32b16e039a2233dd6eefecef325d5` |
| SWE-agent/mini-swe-agent     | main `04d809ceab9df28f9adaed044884180159172930` |
| OpenAutoCoder/Agentless      | main `5ce5888b9f149beaace393957a55ea8ee46c9f71` |
| langfuse/langfuse            | main `56f9093165a1fc3fb52ab46adf4014826da296ef` |
| SigNoz/signoz                | main `785c2e219587d320be4d7516c4c85da82023c384` |
| Aider-AI/aider               | main `5dc9490bb35f9729ef2c95d00a19ccd30c26339c` |

## 比較一覧

| 候補                   | 自動化する役割                           | 既存との重複                                            | 必要追加                                                                 | 費用/保守負担（定性）                                             | 優先順位・今回不採用理由                               |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| OpenHands SDK          | code探索・shell/edit/test・patch生成     | Codex作業、既存branch/CIと重複。問題検出/個別最適化は別 | sanitized Issue入力、sandbox、Node24/pnpm10/隔離DB、Broker、cap・run台帳 | 推論履歴+再試行、container運用、SDK/server追従。中〜高            | Phase 3代替PoC。Agent Canvas一式を本番へ導入しない     |
| SWE-agent              | Issueからaction/observation loop・patch  | 修正Runner/CIの役割                                     | TS monorepo用環境/command、外部cap、Broker、sanitization                 | Python/環境・model設定・trajectory保持。中〜高                    | 研究参考。公式が後継miniを推奨し、新規採用優先度は低い |
| Agentless              | 故障箇所特定→複数patch→検証/順位付け     | RCA・再現/回帰評価と重複                                | TS構造/モノレポ対応、issue入力、既存test harness、budget                 | 複数候補/再現・回帰推論で増幅、研究pipeline保守。高               | 方法論を再利用。現pipelineをそのまま製品実装しない     |
| Langfuse               | LLM trace/Prompt/eval管理                | AiUsage/Prompt版/EVO report/品質audit                   | allowlist exporter、scope mapping、retention/削除、既存評価連携          | web/worker/DB/ClickHouse/Redis/object store又はクラウド費。中〜高 | Phase 4以降、比較管理不足が実証されたら再審査          |
| SigNoz                 | metrics/logs/traces・alert               | console logger/運営alertsと部分重複                     | OTel/Collector、Vercel flush/サンプリング、機密除外、権限                | telemetry保存/転送、ClickHouse/Collectorと監視基盤の監視。高      | Phase 1後、分散技術原因の検索が不足する場合に限定      |
| Aider                  | 人との対話でコード編集、lint/test/commit | 現在の開発作業と強く重複                                | 専用clean checkout、変更制限、外部test/PR Broker                         | repo context+対話token、Python/model設定。中                      | 任意の人手補助。改善基盤の中核にしない                 |
| mini-swe-agent（追加） | 小さい修正agent loop                     | SWE-agent/Codex Runner                                  | sandbox/外部cap/TS環境/Broker                                            | 構造は小さいがshellの運用責任は残る。中                           | Phase 3比較PoC候補、後継を見落とさない                 |
| OpenTelemetry（追加）  | 交換可能なtrace/metric輸送規約           | logger/requestIdと補完的                                | 固定attribute、collector/exporter、相関/flush/欠測                       | 輸送・保存先別費用、計装保守。中                                  | Phase 1-Cの必要経路だけ。新監視製品契約とは分離        |

## OpenHands

現在の主repoはAgent Canvas側で、実行engineはSDK/Agent Server、automationは別repoに分かれている。[repo説明](https://github.com/OpenHands/OpenHands/blob/0f1b6f62507f1ccdb4e63f61cf3dc48356a0d4fa/README.md)、[SDK説明](https://github.com/OpenHands/software-agent-sdk/blob/e3a26821f8f7c85e98078c7b5e1a80647fc7d0c7/README.md)。

[LocalConversation.run](https://github.com/OpenHands/software-agent-sdk/blob/e3a26821f8f7c85e98078c7b5e1a80647fc7d0c7/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py)はagentの実行・イベント保持・iteration制御を持つ。確認modeの再runが実行を進めることと、GitHub/本番の人間承認は同じではない。外部sandbox/budget/policyを必須とする。

[self-host docs](https://github.com/OpenHands/OpenHands/blob/0f1b6f62507f1ccdb4e63f61cf3dc48356a0d4fa/docs/SELF_HOSTING.md)はhost上のfilesystem/env/network全アクセスを警告する。UIの認証やDocker化だけで本番秘密を保護できるとみなさない。SDKだけを隔離Runnerで使う案を推奨する。

[主repo MIT](https://github.com/OpenHands/OpenHands/blob/0f1b6f62507f1ccdb4e63f61cf3dc48356a0d4fa/LICENSE)、[SDK MIT](https://github.com/OpenHands/software-agent-sdk/blob/e3a26821f8f7c85e98078c7b5e1a80647fc7d0c7/LICENSE)。対象sourceの通知保持が必要。クラウド、automation、依存、モデル条件は別審査。[SDK研究報告](https://arxiv.org/abs/2511.03690)は設計/研究の根拠であり、bunshinの安全性・費用・修正成功率の証明ではない。

## SWE-agent / mini-swe-agent

[公式README](https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/README.md)はmini-swe-agentへ開発重心が移り、今後はこちらを推奨すると明記。[agents.py](https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/agent/agents.py)ではaction/observation loop、retry loop、trajectory保存を確認した。利用者記録をtrajectoryへ投入しない。

[原論文](https://arxiv.org/abs/2405.15793)のSWE-bench pass@1 12.5%、HumanEvalFix 87.7%は異なる課題であり、比較して製品修正能力を断定できない。論文時点のモデル/agentと最新repoも異なる。MIT [license](https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/LICENSE)。

miniの[DefaultAgent](https://github.com/SWE-agent/mini-swe-agent/blob/04d809ceab9df28f9adaed044884180159172930/src/minisweagent/agents/default.py)と[DockerEnvironment](https://github.com/SWE-agent/mini-swe-agent/blob/04d809ceab9df28f9adaed044884180159172930/src/minisweagent/environments/docker.py)を確認。小さいloopでも任意shell実行・外部接続の危険は残り、OEM境界/本番承認/PR重複防止は別実装。[MIT](https://github.com/SWE-agent/mini-swe-agent/blob/04d809ceab9df28f9adaed044884180159172930/LICENSE.md)。採用には合成TS不具合の同条件比較が必要。

## Agentless

[repair.py](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/agentless/repair/repair.py)の`max_samples`で候補を複数生成し、Prompt/raw出力をlogへ保存する。外部cap・ログ除外を追加せず運用しない。候補1回の料金を全pipeline費用としない。

[README](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/README.md)の初期27.3%/$0.34と、[論文v2](https://arxiv.org/abs/2407.01489v2)の32%/$0.70は版/条件が違う。READMEの後続モデル成績とも混ぜない。論文は正解patchがIssueに含まれる・説明不足等の課題を分類し、Lite-Sを提案している。モデル/検索/候補数/テスト条件を固定しない横比較は不可。

局所化→再現→修正前後検証の考え方は再利用するが、研究用Python/benchmark構造をbunshinのTypeScript/DB/認証へそのまま適用できる証拠はない。[MIT](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/LICENSE)。データセット/モデルの権利は別。

## Langfuse

[processEventBatch](https://github.com/langfuse/langfuse/blob/56f9093165a1fc3fb52ab46adf4014826da296ef/packages/shared/src/server/ingestion/processEventBatch.ts)で認証済みeventの検証/queue、[compose](https://github.com/langfuse/langfuse/blob/56f9093165a1fc3fb52ab46adf4014826da296ef/docker-compose.yml)でweb/worker/Postgres/ClickHouse/Redis/object storageの依存を確認。自己hostも保守費用を持つ。

[公式masking](https://langfuse.com/docs/observability/features/masking)は送信前除外を提供するが、別exporterのコピーまで保護しない。bunshinの固定allowlistを先に適用する。traceは評価の材料であり、個別最適化や本人能力の正解を自動提供しない。

[root license](https://github.com/langfuse/langfuse/blob/56f9093165a1fc3fb52ab46adf4014826da296ef/LICENSE)はMIT coreと`ee/`、`web/src/ee/`、`worker/src/ee/`等を区別する。[EE license](https://github.com/langfuse/langfuse/blob/56f9093165a1fc3fb52ab46adf4014826da296ef/ee/LICENSE)は別の有効契約が必要。OEM向け組込/再配布を全体MITとして扱わない。既存EVO reportで足りる間は導入しない。

## SigNoz

[community server](https://github.com/SigNoz/signoz/blob/785c2e219587d320be4d7516c4c85da82023c384/cmd/community/server.go)でtelemetry store・querier・ruler/alertmanagerの構成を確認。技術観測には適するが、企業固有の投稿品質・研修成果を判定するものではない。

[現行self-host案内](https://signoz.io/docs/install/docker/)はFoundryを支持し、旧bundled composeを非推奨にしている。最低4GBメモリの前提、WindowsではWSL2の注意があり、Vercelアプリへの輸送/短命process flush・負荷・ネットワークは別PoCが必要。API/ログ量・保持で容量/費用が増える。

[現main license](https://github.com/SigNoz/signoz/blob/785c2e219587d320be4d7516c4c85da82023c384/LICENSE)はMIT coreと`ee/`の別licenseを区別（全体Apacheとは判定しない）。[EE](https://github.com/SigNoz/signoz/blob/785c2e219587d320be4d7516c4c85da82023c384/ee/LICENSE)の本番条件は別契約。既存alerts/読取と輸送規約を先に整える。

## Aider

[base_coder.py](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py)でrepo編集、auto commits、lint/test、reflectionを確認。auto_testは既定falseであり「使えば自動で全部検証」は誤り。dirty checkoutを使わず外部固定CIで検証する。

[benchmark説明](https://aider.chat/docs/benchmarks.html)のコード編集課題と[leaderboard](https://aider.chat/docs/leaderboards/)のモデル/版/複数attempt/料金条件を確認。演習のテスト成功は本番障害再現、RLS、スマホ操作、日本語企画品質の保証ではない。[Apache-2.0](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/LICENSE.txt): license/通知/変更表示等の適用条件、商標と依存/モデル契約を別確認する。

## 追加候補・benchmarkの共通制約

OpenTelemetryはProvider依存を減らす輸送境界候補。[JS Apache-2.0](https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE)、[公式機密情報取扱](https://opentelemetry.io/docs/security/handling-sensitive-data/)を確認。Collector追加は業務母数/本人再現の不足を解決しない。不要なURL/body attributeの収集を避ける。

[SWE-bench公式](https://www.swebench.com/SWE-bench/)はGitHub Issue→patchの再現可能Docker評価を提供し、Verifiedは人が確認した500課題。公開課題、テスト集合、model、candidate数、retry、環境が成績を左右する。認証/OEM隔離、運用原価、意味的個別最適化、本人のAI実践能力を評価した成績ではない。

本監査は上位率の横比較を採用判断にしない。将来PoCでは同じ合成TS課題、同じbase、同じbudget/time/attempt、同じ固定CI、修正前FAIL/後PASS、追加回帰、安全逸脱、費用UNKNOWN、保守時間を比較する。agentが変更できない独立oracleと人間レビューを残す。

## 商用・OEMと費用の判断

対象MIT/Apache sourceは条件付きで商用利用を想定できるが、これは法律判断・全製品再販の許可ではない。通知/変更/依存license、enterprise機能、hosted契約、商標、モデル/API・データセット条件を部品ごとに確認する。今回契約は行わない。

料金は固定しない。API token/候補数、sandbox CPU時間、監視の保存/転送量、バックアップ、patch/脆弱性対応の工数を含める。研究の「$/issue」を現在の月額予算へ外挿しない。具体金額はモデル・地域・保持・負荷・利用条件の承認後に見積もる。

推薦順序: **既存内製接続 → 必要経路のOTel検討 → 人手起動Runner → OpenHands/mini同条件PoC → 必要性が実証された場合のLangfuse/SigNoz**。二つの監視製品と複数agentを同時導入しない。
