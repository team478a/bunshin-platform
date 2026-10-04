# Codex Capability Architecture Gap Analysis

日付: 2026-10-05（Asia/Tokyo）

基準: `origin/main` / `6224fe3b31d8e102e2d13d1d556dd72c38835ae8`

作業ブランチ: `codex/codex-capability-architecture-gap-analysis`

## 1. 結論

現行BUNSHIN Platformを全面再構築する必要はない。Capability Model、Provider Adapter、Program Runtime、Bunshin単位のContextとMemory、AI Usage、Validation、Outcome、Improvementの部品は既に存在する。

一方、長期ループ `Problem -> Context -> Feasibility -> Judgment -> Skill / Workflow -> Capability -> Artifact -> Validation -> Delivery -> Outcome -> Memory -> Improvement` をPackage横断で安全に扱うための共通契約は揃っていない。特にProblem、Feasibility、再利用可能なSkill、Artifact、Codex実行境界は未実装である。

次に行うべき実装はCodex API呼出しや自動修正ではない。まず基本方針とGenspark TestをRepositoryのArchitecture Principlesへ反映し、その後、AI研修の一つの具体的Problemだけを対象にSkill Factory V1の契約を設計する。実行Provider、永続化、UI、自動Deployは契約と安全条件の承認後まで追加しない。

## 2. 調査した内容

- `AGENTS.md`、`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`、`docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/SOCIAL_DECISION_REBRIEF_COMPLETION_REPORT_2026-10-05.md`
- `docs/improvement/WATASHI_WORKS_IMPROVEMENT_ENGINE_V1.md` と関連実装報告
- 2026-10-05付「ワタシワークス 事業・プロダクト・アーキテクチャ基本方針 V1」
- Capability、Provider設定、AI Usage、Generation Context、Improvement、AI研修Skill評価の現行コード

上記基本方針は長期構想の入力であり、現時点のRepository正本を黙って上書きするものではない。現行仕様と矛盾する場合は、先にArchitecture Principles、Decision Log、必要な仕様を独立PRで更新する。

## 3. 現行資産とGap

| 段階             | 現行の再利用資産                                                                           | Gap                                                                            | 判定                 |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------- |
| Problem          | AI研修work context、Barrier、本人の選択式「困った」Feedback                                | Package横断のProblem Contract、明示的な所有主体、状態、期限、取消              | NEW候補              |
| Context          | Workspace/User/Bunshin、Owner Knowledge Grant、Bunshin Memory、Generation Context Snapshot | Problemごとの最小Context projectionと許可根拠                                  | EXTEND               |
| Feasibility      | Capability認可、Service参加、法的同意、予算、各Packageの安全Precheck                       | UNKNOWNを保持できる共通Feasibility Contractと判定根拠                          | NEW候補              |
| Judgment         | SOCIAL Decision Context、Program Policy、各種選定ルール                                    | Package固有Decisionを壊さない共通envelope                                      | 必要性を具体例で検証 |
| Skill / Workflow | AI研修Mission CatalogとSkill評価、Program Runtime、Job orchestration                       | Version付きSkill Registry、Skill入力/出力、検証、廃止、再利用条件              | NEW候補              |
| Capability       | `@bunshin/capability-contract`、Bunshin Capability Assignment、Package分離                 | Coding / Skill Development等の外部Capability要求を表す共通契約                 | EXTEND候補           |
| Provider         | Provider Port/Adapter、暗号化設定、停止、予算、接続検査                                    | Codex Adapter、資格情報、sandbox、repository/branch/tool権限の契約             | NEW候補              |
| Artifact         | 投稿案、Toolkit、動画計画等のPackage固有成果物                                             | 種別、所有者、source revision、validation、利用可否を持つ共通Artifact Contract | NEW候補              |
| Validation       | 構造検証、品質Gate、安全検査、Prompt Version、再検査                                       | Artifactに結び付く検証receiptと人間承認条件                                    | EXTEND候補           |
| Delivery         | LINE、画面、Job、各Packageの公開/配信経路                                                  | Codex成果物を自動配信しない明示Gate                                            | 契約で固定           |
| Outcome          | Mission Outcome、Social Goal Outcome、Business Outcome                                     | Skill/Artifact revisionと成果を因果と誤認せず関連付ける契約                    | EXTEND候補           |
| Memory           | Bunshin Memory、Program固有状態                                                            | Package間共有の明示許可。暗黙共有は禁止                                        | 現行原則を維持       |
| Improvement      | 共通Observation/Evidence契約、本人Feedback、Review UI、Triage永続化                        | 確定Issue、実装承認、指示案、修正前後比較                                      | 後続段階             |

## 4. Codex利用に固有のGap

### 4.1 現在あるもの

- ProviderをCoreへ混ぜないPort/Adapterパターン。
- Provider設定のVersion、暗号化、接続検査、停止、日次/月次予算。
- AI Usageのprovider、model、Prompt Version、Token、原価、処理時間、成否、冪等キー。
- Improvement Issueの状態遷移と、APPROVED・同一scope・Candidate/Evidence revision一致を確認する純粋な適格性判定。
- Repository、Capability、Workspace、User、Bunshinを越境させない既存認可原則。

### 4.2 現在ないもの

- `CODEX`をProviderとして有効化する設定・Port・Adapter。
- repository、base SHA、branch、読取/書込パス、許可tool、network、secret、予算、timeoutを固定する実行契約。
- Problem/Evidence revisionから、目的、再現条件、禁止範囲、変更候補、検証、完了条件を作る指示案契約。
- 指示案のsource、version、validation、人間承認、失効、取消を扱うArtifact契約。
- 承認済みCandidateから指示案へ進むApplication Use Caseと永続監査。
- Codex実行、PR作成、merge、deployを分離する権限モデル。
- 修正後に同じ母数・期間・rule versionで比較し、改善不能や再発を記録する経路。

`isImprovementInstructionEligible` は最後の純粋条件の一つであり、実認可、承認保存、指示生成、Codex起動を保証しない。現行Triageも `OPEN / REVIEWED / DISMISSED / STALE` だけで、REVIEWEDをAPPROVEDへ自動昇格させてはならない。

## 5. Genspark Testの現状

利用者へ単機能AI Wrapperを提供しないという考え方は、既存のProvider分離とMVP Firstに整合する。ただし、次の審査質問は現行 `docs/ARCHITECTURE_PRINCIPLES.md` とPR templateへまだ明示されていない。

1. 巨大AIが同じ機能を標準搭載しても利用理由が残るか。
2. 巨大AIだけで80%できても、残り20%に十分な価値があるか。
3. Provider性能が10倍になったとき、Platformは強くなるか。
4. 利用者がワタシワークスを開く理由は何か。
5. 利用後に独自のContext、Outcome、Skill等が何として蓄積されるか。

これは自動スコアではなく、新機能の目的・独自資産・依存関係を人間がレビューするGateとして導入するのが妥当である。

## 6. 推奨する小PR順序

### PR 1 Architecture Principles反映

- 長期ループ、Outcome中心、外部CapabilityとProviderの区別、Genspark Testを追記する。
- 現行の `1 User : N Bunshin`、Tenant分離、Capability境界、MVP Firstを弱めない。
- コード、DB、Provider設定は変更しない。

### PR 2 AI研修Skill Factory V1設計

- AI研修の一つの具体的Problemを選ぶ。
- Problem、Feasibility、Skill、Artifact、Validationの最小契約を設計する。
- 既存Program Runtime、Mission Catalog、Skill評価、AI Usageの再利用範囲を固定する。
- Codexはまだ呼ばない。新Skillの自動生成、永続化、UIも追加しない。

### PR 3 Pure Contract

- Package内または適切な既存境界へ純粋型・validationだけを追加する。
- UNKNOWNをPASSEDへ補完しない。
- Workspace/User/Package scope、revision、size limit、禁止データをテストする。
- 共通Core昇格は、AI研修の実例で必要性が確認できた部分だけに限定する。

### PR 4 Human Prepared Codex Instruction Draft

- 承認済みの限定Problemだけから、安全な指示案を作る。
- 本文、写真、会話、Memory、Token、secret、直接User/Bunshin IDを含めない。
- 外部実行なし、コード変更なし、PR作成なし。コピー可能なDraftまでとする。
- Candidate/承認の既存Gapを先に解消できない場合は着手しない。

### PR 5 Codex Adapter検証

- PR 1〜4と人間レビュー後に別承認する。
- stagingまたは使い捨てrepositoryで、読取中心・固定予算・固定tool・自動merge/deploy禁止とする。
- 本番資格情報、顧客素材、実課金、SNS/LINE送信へ接続しない。

## 7. 明示的に延期するもの

- 完全自動Skill生成と自動採用。
- ログからの自動コード変更、PR merge、本番Deploy。
- 高度なProvider自動選択。
- 新Agent、共有Memory、Analytics基盤、全Package共通UI。
- 新しいテーブルやmigrationを前提にした先行実装。
- AI研修で検証していない契約のハッシーへの先行接続。

## 8. テストと停止条件

後続契約では最低限、次を固定する。

- Workspace/User/Bunshin/Package越境を拒否する。
- Problem、Evidence、Skill、Artifactのrevision不一致を拒否する。
- UNKNOWNまたは未確認のFeasibilityを実行可能と扱わない。
- 原文、写真、会話、Memory、secret、Provider raw responseを指示案へ複製しない。
- APPROVED以外、取消済み、期限切れ、権限失効時は指示案を生成・利用できない。
- Draft作成、Codex実行、PR作成、merge、deployを別権限として扱う。
- AI Usageにmodel、Prompt Version、使用量、原価、処理時間、成否を残す。

大規模schema、新Providerの実課金、外部送信、顧客データ利用、自動実行が必要になった時点で停止し、目的、選択肢、Privacy、費用上限、rollback、人間承認を先にレビューする。

## 9. ハッシーとの関係

現行Hassy Decision/reBriefのコード実装は完了している。残るのは本番24〜72時間の運用観測と、実利用が確認できた場合の安全な集計経路判断である。Codex Capability構想のために、安定したHassy生成経路へ新契約やProviderを追加しない。

長期ロードマップ上のHassy接続は、AI研修の限定Pilotで価値・品質・費用・人間確認工数を測定し、成功した契約だけを共通Coreへ昇格した後に再判断する。

## 10. 次Phaseへ進める条件

1. 本Gap Analysisを人間がレビューする。
2. 長期ロードマップのPhase番号を現行Platform Phaseと区別する。
3. Architecture Principlesへ反映する文言とGenspark Testの適用範囲を承認する。
4. AI研修で扱う最初のProblem、期待Outcome、禁止データ、費用上限、人間承認点を一つに限定する。
5. DB、UI、Provider実行を伴わない設計PRから開始する。
