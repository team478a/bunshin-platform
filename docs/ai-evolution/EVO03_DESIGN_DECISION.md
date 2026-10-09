# EVO-03 task互換policy — 実装前判断

基準main: `dfcbe39b5ada8446bf36e5afe82f3d8b760d86d5`（#1190 merge、main CI成功）。監査#1188の`IMPLEMENTATION_PLAN.md` EVO-03を参照する。専用branch: `codex/ai-evolution-evo03-task-compatibility`。

- 対象はSOCIAL_PLANNER（既存Daily/Weekly）とTRAINING_ASSESSMENTのみ。AI固有のAPI/model/schema/optionsはWebのAdapter側に置き、Core/Applicationへ持ち込まない。
- 既存resolverに任意taskを追加し、管理設定優先・未設定時だけlegacy fallback・環境/停止/検証/予算の既存検査を維持する。不適合な管理設定からlegacyへ逃げない。対象以外は従来どおり。
- Adapterでも送信前にモデル完全一致、Responses、文字列text入力、既存名のstrict JSON schema、store:false、既存optionsだけを確認する。schema全体の汎用検証エンジンやモデル自動選択は作らない。
- Policy版`OPENAI_TASK_COMPATIBILITY_V1`。既存モデル`gpt-5.2` / `gpt-5-mini`と公式に記載されたsnapshotだけを列挙。任意の日付suffixや新modelを名前から推測しない。既定model/Prompt/request本文は変更しない。これはローカルrequest契約の検証であり実モデル品質・アカウントアクセス・費用の承認ではない。
- 根拠: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)、[GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2)、[GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini)（2026-10-09閲覧）。両modelのtext/Responses/Structured Outputsを確認。公式の推奨新modelへの移行はしない。Miniのdeprecated表示は本番利用可能性の別確認事項とし、自動置換しない。
- 既存Pilot/seat/admission/provider直前認可/LINE/V1/課金/Memoryは非変更。新key、実API、DB/schema/migration、本番操作はなし。
- Release前には実設定modelとallowlistの一致を人間が確認する。未登録の旧modelは意図的にfail-closedとなるので、既存設定すべての無条件互換とは主張しない。aliasは外部で更新され得る。新model追加/実比較/本番反映は別承認。
- rollbackはPR revertで旧検査へ戻す（DB操作なし）。EVO-04へ自動着手しない。
