# Strategy Generator 実装レポート

## 実装範囲

FREE SOCIAL MVPのAccount Strategy Generatorを実装した。Wizard回答、対象Bunshin、同一Bunshinへ明示的にGrantされたOwnerKnowledgeから、承認前の`PROPOSED` Strategy versionを生成する。

Daily Mission生成、Mission Decision / Activity、PostRecord、Feedback、Memory学習、SNS投稿、画像・動画生成、LINE、BLOG、Jobは含めない。

## 構成

```text
verified session / same-origin request
  -> Bunshin・SocialProfile・Knowledge Grantのscope検証
  -> GenerateSocialAccountStrategy（Core use case / port）
  -> OpenAIStrategyGenerator（Web provider adapter）
  -> strict structured outputの検証
  -> SocialAccountStrategy PROPOSED versionの保存
```

- CoreはOpenAI、HTTP、Next.jsへ依存しない。
- Provider adapterはOpenAI Responses APIを使用し、`json_schema`のstrict structured outputを要求する。
- API requestの保存は`store: false`とする。
- modelは`OPENAI_STRATEGY_MODEL`で差し替え可能とし、未設定時は`gpt-5.2`を使用する。
- prompt versionは`social-account-strategy-v1`として記録する。

## ContextとIsolation

生成へ渡す情報は次だけに限定する。

- Wizard回答
- 対象SocialProfileのplatform
- verified sessionから解決した対象BunshinのObjective / Audience / Personality
- `workspaceId + bunshinId + actorUserId`で取得したGrant済みOwnerKnowledge

別Workspace、別User、別Bunshin、GrantされていないOwnerKnowledge、BunshinMemoryは渡さない。SocialProfileも同じWorkspace/Bunshin/platformに属し、requestの`socialProfileId`と一致することを保存前に検証する。

## 出力と保存

Provider出力は以下6項目のstrict schemaとCore validationを通す。

- concept
- positioning
- targetSummary
- profileDraft
- ctaStrategy
- postingPolicy

生成結果は既存のversioning use caseを通して`PROPOSED`として保存し、既存APPROVED versionを自動更新・上書きしない。

## Observability

成功・失敗の両方についてrequestId、workspaceId、bunshinId、model、prompt version、latencyをstructured logへ記録する。成功時はinput/output token数も記録する。Wizard回答、Knowledge本文、生成本文、API keyはログへ記録しない。

## Environment

| Name                    | 必須 | 用途                              |
| ----------------------- | ---- | --------------------------------- |
| `OPENAI_API_KEY`        | 必須 | server-only Provider credential   |
| `OPENAI_STRATEGY_MODEL` | 任意 | Strategy Generator model override |

値はrepositoryへcommitしない。localはrootの`.env.local`、ProductionはVercelのProduction Environment Variablesへ登録する。現在の方針どおりPreviewへProduction credentialを設定しない。

## テスト

- CoreがProviderのstructured outputを正規化し、不完全出力を拒否する
- AdapterがResponses APIへstrict JSON schemaと`store: false`を送る
- Provider failureを安全なapplication errorへ変換する
- HTTP層が同一scopeのBunshinとGrant済みKnowledgeだけを渡す
- 別Workspace/Bunshinとして対象を取得できない場合、Providerを呼ばない
- 生成結果を`PROPOSED` versionとして保存する

## Production反映前の手動作業

1. Vercel ProjectのProduction Environment Variablesへ`OPENAI_API_KEY`を登録する。
2. 必要な場合だけ`OPENAI_STRATEGY_MODEL`を登録する。
3. main deploy後に認証済みWizardから1件生成し、本文を含まない成功ログとtoken/latencyを確認する。
4. 異常系を検証する場合もAPI keyやKnowledge本文を画面・ログ・issueへ貼らない。
