# ADR: AI・外部エージェントをBUNSHINの制御下に置く

## Status

Proposed

## Context

BUNSHINは将来、複数AIモデル、検索Provider、Hermes等の外部Agentを比較・交換する可能性がある。一方、外部実行系へ本番DB、秘密情報、LINE送信、任意Tool、全利用者情報を渡すと、tenant越境、誤送信、費用暴走、自己改変、復旧不能の危険がある。

既存のBunshin、Knowledge Grant、Memory、Mission、Activity、Trend Evidenceを正本として維持し、外部Agentを一時的な作業Adapterに限定する必要がある。

## Decision

1. BUNSHINのDomain／Applicationを正本とし、外部Agentは`AgentRuntimePort`のAdapterに限定する。
2. 外部Agentへは、目的、許可context、許可Skill、許可Tool、予算、期限、出力schemaを持つ`AgentWorkOrder`だけを渡す。
3. 外部AgentへDB直接接続、Secret取得、任意HTTP、任意shell、LINE直接送信、SNS直接投稿、本番設定変更を許可しない。
4. User／Workspace／Bunshin／Knowledge Grantの所有権はBUNSHINサーバー側で実行前後に検証する。
5. AI／Agent出力はJSON Schemaで検証し、不正・不完全・予算超過時は永続化せず安全なfallbackへ戻す。
6. 全実行にworkflowVersion、schemaVersion、provider／model識別子、費用、token、遅延、成否、固定errorCategoryを記録する。ただしPrompt本文、思考過程、raw response、個人情報、Secretは監査logへ保存しない。
7. Provider／workflow単位のtimeout、予算、rate limit、circuit breaker、kill switch、rollbackを必須にする。
8. AIはMemory、設定、Prompt、Skillを直接変更しない。変更はProposalとして提出し、人間承認と回帰評価後だけ有効化する。
9. 初期は既存MissionActivity、PostRecord、MissionFeedback、BunshinMemoryを正本とし、汎用Outcome／Preference tableを重複作成しない。
10. Hermes、Agent Skills、MCP等の外部形式は交換・移植用とし、BUNSHINの内部Domainをそれらへ従属させない。

## Consequences

- 新しいAI／AgentをAdapterとして比較でき、中核データと配信権限を守れる。
- 直接統合より実装量は増えるが、停止、監査、費用制御、rollbackが可能になる。
- Agentの自由度は制限される。許可Tool追加には個別の脅威分析と人間承認が必要になる。
- Golden DatasetとSchema互換テストを継続保守する必要がある。

## Deferred

- Provider RegistryのSchema
- Preference LearningとLearning ProposalのSchema
- Skill Registryと外部形式export
- Hermes Adapter
- MCP Gateway
- write Toolと自動承認条件

これらは行動データ、運用上の必要性、Provider比較結果を確認後に別ADRで決定する。

## References

- `docs/AI_AGENT_COMPATIBILITY_REBASELINE.md`
- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/TREND_RESEARCH_DELIVERY_PLAN.md`
- `docs/adr/TREND_RESEARCH_PROVIDER_ADR.md`
