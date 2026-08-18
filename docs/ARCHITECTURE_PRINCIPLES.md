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
