# BUNSHIN Platform アーキテクチャ原則

## 1. プラットフォームの中心

BUNSHIN Platformの中心はSNSでもブログでもありません。

中心は、1ユーザーが複数のBunshinを所有し、それぞれが独立した目的、人格、知識、記憶、成果指標を持つことです。

```text
Workspace
  └─ User
      ├─ Bunshin A
      │   ├─ Objective
      │   ├─ Audience
      │   ├─ Personality
      │   ├─ Knowledge Grant
      │   ├─ Memory
      │   ├─ Capability
      │   └─ Performance
      └─ Bunshin B
          └─ 独立した同一構造
```

## 2. Owner KnowledgeとBunshin Memory

### Owner Knowledge

ユーザー本人が所有する共通素材です。

- 経歴
- スキル
- 実績
- 商品・サービス情報
- FAQ
- 画像・資料

全Bunshinが自動的に利用してはいけません。Bunshinごとに利用許可を設定します。

### Bunshin Memory

各Bunshinだけが所有する記憶です。

- 投稿履歴
- 学習した専門知識
- ターゲットの反応
- 成功・失敗
- 発信スタイル
- CTA成果

別Bunshinへ暗黙共有しません。

## 3. Capability Model

Bunshinは主体であり、Capabilityは仕事能力です。

初期:

- `SOCIAL`

将来候補:

- `BLOG`
- `LINE_MARKETING`
- `LP`
- `RESEARCH`
- `LEAD_GENERATION`
- `SALES`
- `CUSTOMER_SUPPORT`
- `RECRUIT`

Coreから各Capabilityへの依存を最小化し、Capability Contractを介して接続します。

## 4. Provider Adapter

OpenAI、Gemini、LINE、Canva、Instagram等はProviderです。

```text
Bunshin / Capability
        ↓
 Application Service
        ↓
 Provider Port
        ↓
 Provider Adapter
        ↓
 External Service
```

Providerを変更してもBunshinのドメインモデルが変わらないようにします。

## 5. Goal-oriented Design

Daily Missionの目的は投稿数を増やすことではありません。各BunshinのObjectiveとKPIに近づくことです。

例:

- 副業分身: LINE登録者を増やす
- 営業分身: 無料相談予約を増やす
- 採用分身: 採用LINE登録・応募を増やす

MVPでは高度なKPI最適化を実装しなくても、MissionにObjectiveとの関連を保持します。

## 6. Multi-tenant Isolation

すべての主要データはWorkspaceおよびBunshinの境界を持ちます。

必須:

- APIで所有権を検証する
- Repository層でtenant条件を落とさない
- AI入力へ他BunshinのMemoryを混ぜない
- 管理画面のデバッグアクセスを監査ログへ残す
- Cross User / Cross Bunshin isolation testを実装する

## 7. Event and Job Idempotency

Daily Mission生成、LINE通知、Memory抽出などの非同期処理は冪等にします。

推奨キー例:

```text
daily_mission:{bunshin_id}:{local_date}
line_daily_push:{bunshin_id}:{mission_id}
memory_extract:{source_type}:{source_id}:{prompt_version}
```

## 8. AI is a Replaceable Component

LLMの出力を直接DBへ無検証で保存しません。

- 構造化Schema
- Validation
- Quality Check
- Prompt Version
- Usage Log
- Fallback / Retry

を通します。

## 9. MVP First

将来性のために境界は設計しますが、MVP外の実体は作りません。抽象化は具体的な次のCapabilityに必要な範囲に留め、過剰設計を避けます。

## 10. Outcome First

AIの単機能そのものを商品価値の中心にしません。ユーザーのProblemから始まり、実際のOutcomeへ到達することを価値とします。

「Codexが使える」「画像生成できる」「動画生成できる」こと自体ではなく、例えば次の結果を重視します。

- 業務時間が削減された
- SNS投稿が完成した
- 問い合わせにつながった
- 実務でAIを利用できるようになった

既存のGoal-oriented Designを維持し、機能利用数や生成数だけを成果とみなしません。

## 11. AI Capability Architecture

Reasoning、Coding、Skill Development、Image Generation、Video Generation、Voice、Search / Research等を、Platformが要求できる仕事能力として扱います。ChatGPT、Codex、画像生成AI、動画生成AI、音声AI等の具体的な外部サービスは、その能力を実現する交換可能なProvider候補です。

CapabilityとProviderを区別し、特定Provider名をDomain Modelの中心に置きません。Provider固有のSDK型、API応答、認証、料金単位、実行方式をCoreやPackage Domainへ混在させず、Provider PortとAdapterの外側へ閉じ込めます。

Capabilityの追加は、既存のBunshin CapabilityやPackage固有Capabilityを無条件に共通化することを意味しません。具体的なPackageで必要性と境界を確認し、既存Capability Contractを通して段階的に接続します。

## 12. Platform-owned Assets

汎用推論、Coding、画像、動画、音声等の能力を外部Providerへ委ねても、次はPlatform側の重要資産として扱います。

- Context
- Memory
- Problem / Intent
- Judgment
- Skill
- Workflow
- Execution History
- Outcome
- Improvement

これらを共通資産と呼ぶ場合も、Package、Tenant、Workspace、User、Bunshin、Serviceの所有・利用境界を失わせません。別の境界へ利用する場合は、既存の認可、Grant、Capability、法的同意等に基づく明示的な許可を必要とし、暗黙共有しません。

Owner KnowledgeとBunshin Memoryの分離、User間・Bunshin間・Workspace間のIsolationを維持します。外部Providerへ渡すContextも、目的に必要な最小範囲へ明示投影します。

## 13. Long-term Loop

長期的な設計方向を次のループとします。

```text
Problem
  -> Context
  -> Feasibility
  -> Judgment
  -> Skill / Workflow
  -> Capability
  -> Artifact
  -> Validation
  -> Delivery
  -> Outcome
  -> Memory
  -> Improvement
```

これは全段階を今すぐ共通Coreへ実装する指示ではありません。MVP Firstを維持し、具体的なPackageで必要性と再利用性が確認された契約だけを段階的に共通化します。

Package固有の意味、Policy、状態遷移を無理に共通Coreへ移しません。将来拡張だけを理由に、利用実績のない巨大な共通基盤、抽象契約、永続モデルを先行実装しません。

## 14. Human-in-the-loop

AI生成、Skill生成、改善提案、コード生成等を、本番変更へ直接接続しません。少なくとも次を別段階・別権限として扱います。

1. Draft作成
2. Validation
3. Human Approval
4. 外部実行
5. PR作成
6. Merge
7. Deploy

前段階の成功を後段階の承認とみなしません。承認時点のscope、revision、実行主体、対象環境、費用上限、安全条件を後段階でも再確認します。

ログ、Feedback、OutcomeからAIが自動的に本番コードを変更し、そのままPR作成、Merge、Deployする構造は採用しません。AI生成物を無検証で公開、配信、権威ある業務状態の確定、DB更新へ利用しません。

## 15. Genspark Test

新しいAI機能、Package、Capabilityを企画するとき、次を人間レビューの判断基準として使用します。

1. ChatGPT等の巨大AIが同じ機能を標準搭載しても、ワタシワークスを利用する理由が残るか。
2. 巨大AIだけで80%できるようになっても、残り20%に十分な価値があるか。
3. ChatGPT、Codex等のProvider性能が10倍になった場合、ワタシワークスは弱くなるか、それとも強くなるか。
4. ユーザーが巨大AIを直接利用するのではなく、わざわざワタシワークスを開く理由は何か。
5. 利用後、ワタシワークスにContext、Outcome、Skill、Workflow、Feedback、Execution History等の独自資産が何として蓄積されるか。

Genspark Testは自動スコアリングではありません。新機能の目的、独自価値、外部AIへの依存、コモディティ化リスクを人間がレビューするGateです。

十分に説明できない機能、特に巨大AIの一機能を別UIで提供するだけのWrapper型機能は、単独商品化や先行実装を再検討します。Testの通過だけで、実装、外部実行、本番提供を承認したことにはなりません。

## 16. Provider Improvement Principle

外部AIの進化をPlatformの陳腐化要因ではなく、ワタシワークスの能力向上として吸収できる構造を優先します。

```text
Codex等が改善
  -> Coding / Skill Development能力が改善

画像生成AIが改善
  -> Image / Visual Creation能力が改善

動画生成AIが改善
  -> Video Creation能力が改善
```

巨大AIと同じ単機能を自前で競争して実装するのではなく、必要に応じて交換可能なProviderとして取り込みます。Providerを変更または追加しても、Platformが保持するContext、Problem、Judgment、Skill、Workflow、Outcome、Improvementと、BunshinやTenantの所有境界が変わらない構造を目標とします。

## 17. 既存原則との関係

本追加は既存Architecture Principlesを置き換えません。次を引き続き絶対条件として維持します。

- `1 User : N Bunshin`
- Workspace / User / Bunshin / Service境界
- Owner KnowledgeとBunshin Memoryの分離
- Capability Model
- Provider Adapter
- Goal-oriented Design
- Multi-tenant Isolation
- Event and Job Idempotency
- AI is a Replaceable Component
- MVP First

新しいProblem、Feasibility、Skill、Artifact、Codex Adapter等の契約や実装は、それぞれ人間レビュー済みの独立作業として扱います。本原則の追加だけを根拠に、コード、DB、Provider、UI、本番設定へ変更を加えません。
