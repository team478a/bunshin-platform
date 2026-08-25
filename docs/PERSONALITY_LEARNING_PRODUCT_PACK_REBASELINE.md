# 人格学習・公式商品パック Rebaseline

## 1. 目的

人格学習をBUNSHIN共通Core、公式商品パックを組織向け拡張として分離し、Daily Mission生成時にだけ明示的なGeneration Contextで組み合わせる。初期検証は1企業、1商品、1SNS、10〜22人、30〜60日を想定する。

## 2. 最新mainの実装監査

### 実装済み

- `BunshinPersonality`: 口調、丁寧さ、活力、専門性、文章スタイル、一人称、好ましい表現、禁止表現、ビジュアル方針、顔・声方針
- `BunshinMemory`: Workspace / Bunshin scope、種別、本文、要約、信頼度、重要度、有効化、論理削除
- Grant済みOwnerKnowledge、人格概要、SNS戦略、Weekly Plan、Content Pillar、Trend Candidateを使うDaily Mission生成
- Mission Decision、Activity、PostRecord、FeedbackのRaw Event
- Prompt Version、Provider、Model、token、原価、遅延、成否のAI Usage記録
- Workspace / User / Bunshin isolationとCapability guard

### 未実装

- 詳細人格の一般ユーザー向けAPI/UI、版管理、復元
- Missionテーマに応じたMemory選択と生成への投入
- Context構築を一元化するGeneration Context Builder
- 生成時に使用した人格・Memory・Knowledge・商品版のSnapshot
- Product Pack、Version、Rule、Asset、Invitation、Participation、Bunshin Assignment
- Learning Proposal、本人承認、取消、人格版への反映
- 商品向け決定的検査、意味的品質検査、重複回避

## 3. 採用する境界

### 3.1 所有権

- 人格、個人Memory、個人Knowledge、Mission、Feedbackは本人のWorkspace / Bunshin境界に残す。
- Product PackはOrganization Workspaceが所有する。
- Product Pack参加はUserの明示同意を記録し、参加先WorkspaceとUserを両方scopeに持つ。
- Product Packを利用できるBunshinは本人が明示的に割り当てる。
- 本部は参加者の人格、個人Memory、個人Knowledge、投稿全文、他商品の活動を参照しない。

### 3.2 Version

- 公開済みProduct Packを直接上書きしない。変更は新しいVersionとして公開する。
- AssignmentはPackを選択し、生成時にはその時点の最新`PUBLISHED` Versionを解決する。
- 実際に使用したVersion IDはGeneration Context Snapshotへ固定する。
- 退出・Pack停止後の新規生成を禁止するが、過去Snapshotと監査参照は保持する。

### 3.3 公式事実と個人体験

- 価格、仕様、契約条件、公式URL、期間、FAQ、必須表記はProduct Pack Versionを正本とする。
- 個人体験・意見は本人所有のKnowledgeまたはMemoryに置き、Product Packへ複製しない。
- 個人Memoryは公式事実を上書きできない。
- 他人の体験談を本人の体験として生成しない。

## 4. Generation Context

生成Providerへ直接Repositoryを増やさず、Application層のBuilderが次を構築する。

1. Bunshin Identity / Personality Version
2. Missionテーマに関連するSelected Memory
3. Grant済みKnowledge
4. Social Profile / Strategy / Weekly Plan / Format
5. 有効なProduct Pack Version / Rules
6. 有効期限内のTrend Evidence

BuilderはWorkspace、User、Bunshin、Grant、Participation、Assignmentをサーバー側で再検証する。Memory、Knowledge、商品資料内の命令文はデータとして扱い、System Promptを変更させない。

### 4.1 Snapshot最小構成

- workspaceId / bunshinId / dailyMissionId
- personalityVersionId
- selected Memory ID、要約、選択理由
- Knowledge ID
- socialProfileId / strategyId / weeklyPlanId
- productPackId / productPackVersionId / rule version
- Trend Candidate / Evidence ID
- promptVersion / provider / model
- quality verdict / issue code / repair count
- generatedAt

秘密値、Provider raw response、思考過程、別利用者の本文は保存しない。Snapshotは生成根拠の追跡用であり、編集可能なKnowledgeやMemoryの代替にしない。

## 5. 人格Versionと学習

- `BunshinPersonality`の変更はVersionを作り、現在版をBunshinから参照する。
- 直接編集と学習反映のどちらも、変更者、変更理由、変更元Versionを記録する。
- Learning ProposalはRaw Eventから作るが、単発評価では作らない。
- 初期閾値は同種不採用理由3件以上を候補とし、設定値として版管理する。
- Proposalは`PENDING | APPROVED | REJECTED | REVOKED`とする。
- 未承認Proposalを生成Contextへ含めない。
- 承認時は新しい人格Versionまたは本人所有Memoryを作る。既存版を上書きしない。
- 取消時は変更前Versionへ戻せるようにし、監査Eventを削除しない。

匿名横断学習は先行テスト前に実装しない。将来も原文、個人情報、LINE情報、非公開商品情報を使用せず集計値だけを利用する。

## 6. Product Pack候補モデル

- `ProductPack`: Organization Workspace所有、識別子、公開区分、状態
- `ProductPackVersion`: 正式名称、事実、価格、条件、FAQ、URL、販売期間、version、状態
- `ProductPackRule`: 許可表現、禁止表現、必須表記、注意事項、根拠
- `ProductPackAsset`: Asset metadata、Storage key、利用条件。binaryをDBへ保存しない
- `ProductPackInvitation`: token hash、有効期限、利用上限、紹介元
- `ProductPackParticipation`: pack、参加Workspace、User、同意版、状態、参加・退出日時
- `BunshinProductPackAssignment`: 本人Bunshin、pack、状態

初期は1 BunshinにつきACTIVEなProduct Pack Assignmentを最大1件とする。内部構造は将来複数商品へ拡張可能にする。

## 7. コンプライアンス検査

初期対象商品の業種・対象法域を実装前に確定する。

- 決定的検査: 正式名、価格、URL、期限、禁止語、必須表記
- AI検査: 根拠のない効果、誇大表現、架空体験、意味的矛盾
- `PASS`: コピー可能
- `WARNING`: 警告確認後にコピー可能。確認Eventを保存
- `BLOCKED`: コピー不可。修正または最大1回再生成

AI検査だけで価格や必須表記の正否を決めない。検査rule versionと結果をSnapshotへ保存する。

## 8. 権限とIsolation Test

必須テスト:

- 本部は参加者のMemory / Knowledge / 投稿全文を取得できない。
- 参加者Aは参加者Bの人格、Memory、Mission、Feedbackを取得できない。
- 未参加User、未割当Bunshin、退出済み参加者はPackを生成に利用できない。
- 別Organization WorkspaceのPackを利用できない。
- DRAFT / RETIRED Versionを生成に利用できない。
- 他BunshinのMemory、未Grant Knowledge、他人の体験談をContextへ含めない。
- Pack停止後も過去Snapshotは追跡できるが新規生成はできない。

## 9. PR分割

### Stage 0: 設計

1. Rebaseline / ADR / Roadmap（文書のみ。本PR）

### Stage 1: 人格とGeneration Context

2. Generation Context Contract / Snapshot Core
3. Personality Version Core / Migration / Repository / Test
4. 詳細人格API / UI / 復元
5. Memory Selector / token budget / Daily Mission接続

### Stage 2: Product Pack先行検証

6. Product Pack / Version / Rule / Asset Core
7. Product Pack管理API
8. 本部管理UI
9. Invitation / Participation
10. Bunshin Assignment
11. Product Pack Context接続 / Snapshot
12. 決定的検査 / AI品質検査
13. Pack利用指標

### Stage 3: 承認型人格学習

14. Learning Proposal Core
15. Proposal生成Job
16. 本人確認UI
17. 承認 / 修正 / 却下 / 取消 / 復元
18. 学習前後KPI

### Stage 4: 検証後

19. 投稿Fingerprint / 類似度
20. グループ内訴求分散
21. 匿名横断集計

## 10. Go / No-Go

先行テスト開始には、Pack作成・公開、明示参加、Bunshin割当、生成反映、必須表記・禁止表現検査、使用Version記録、Isolation Test、スマートフォン確認、利用規約・プライバシー追記が必要である。

高度学習、類似度、課金、OEM、複数商品、複数SNS、自動投稿は先行テスト開始条件に含めない。

最重要KPIは「参加者のうち7日間で3回以上、実際に投稿したUser率」とする。人格学習は反映前後の採用率、GOOD率、投稿完了率、同じ修正の反復回数を分離して評価する。

## 11. 停止条件

本PRの人間レビューで次を承認するまでコードを変更しない。

- Organization Workspace所有とUser同意の二層構造
- AssignmentはPackを指し、生成時に最新PUBLISHED Versionを解決する方針
- 個人体験を本人所有Knowledge / Memoryへ置く方針
- Snapshot最小構成と保持期間
- 初期対象商品の業種・法域
- Stage 1〜3の範囲とPR分割
