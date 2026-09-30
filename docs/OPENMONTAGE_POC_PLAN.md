# OpenMontage 最小PoC計画（未実施）

固定点：bunshin `29f0f92b056870ccb895692ac8c33873d2d818f2`、OpenMontage `08e2151fa02de28a5d6a312b3d575692bf147ad7`。2026-09-30 JST作成。**本書は計画のみ。PoCコード、Dockerfile、依存導入、実API呼出し、媒体生成、LINE送信は行っていない。** [差分](OPENMONTAGE_GAP_ANALYSIS.md)の推奨Aを変更する承認ではない。

## 段階・対象工程・判断ゲート

PoC 1は法務・セキュリティが読み取り検討を許可した後、架空の商品/人物・固定素材で「合成だけ」を隔離環境に試す計画。候補はOpenMontageの `tools/video/video_compose.py` にある限定的な合成操作。AI企画/素材生成/人の演出判断/LINE/本番Storageは含めない。既存Creatomateの同じ固定素材・解像度・尺で得る基準出力と比較する。固定素材の合成成功は、AIエージェントの無人実行性、個別化、品質優位性、原価優位性を証明しない。

PoC 1の合格と独立の法務・運用レビュー後にのみ、PoC 2（別途承認された実API）を提案する。既存経路と候補を**同じ承認済み入力・出力仕様・評価者**で比較し、現行より明確な追加価値がなければAを継続する。PoC 2の実施も本書の作成では承認されない。

## bunshin正本の擬似入出力契約（実装しない）

```ts
type VideoWorkOrder = {
  schemaVersion: 1;
  workspaceId: string;
  serviceId: string;
  groupId: string;
  ownerUserId: string;
  bunshinId: string;
  projectId: string;
  projectRevision: number;
  sceneIds?: string[];
  operationKey: string; // project/revision/stage/attemptを固定。外部発注は別の一意キー
  approvedInputHash: string;
  approvalId: string;
  approvedAt: string;
  productPackVersion: string;
  personaVersion: string;
  historySnapshotHash: string;
  assets: Array<{
    assetId: string;
    ownerScope: string;
    kind: 'image' | 'video' | 'audio';
    sha256: string;
    byteLimit: number;
    ephemeralReadUrl: string;
  }>;
  output: {
    width: number;
    height: number;
    fps: number;
    maxSeconds: number;
    codec: string;
    captionsLanguage: 'ja';
    requiredLogoId?: string;
    requiredCta?: string;
    requiredDisclosure?: string;
  };
  allowedProviders: string[];
  maximumExternalCostUsdMicros: number;
  deadlineAt: string;
  configurationVersion: string;
  temporaryRootId: string;
};
type VideoWorkResult = {
  operationKey: string;
  approvedInputHash: string;
  configurationVersion: string;
  stages: Array<{
    stageId: string;
    sceneId?: string;
    status:
      | 'PENDING'
      | 'SUBMITTED'
      | 'RUNNING'
      | 'SUCCEEDED'
      | 'FAILED'
      | 'UNKNOWN_SUBMISSION'
      | 'CANCELLED';
    externalOrderId?: string;
    startedAt?: string;
    endedAt?: string;
    actualCostUsdMicros?: number;
    errorCode?: string;
    retryable?: boolean;
  }>;
  artifacts: Array<{
    sceneId?: string;
    storageKey: string;
    sha256: string;
    bytes: number;
    mime: string;
    durationSeconds: number;
    ownerScope: string;
  }>;
  totalActualCostUsdMicros: number; // 利用枠とは独立した実請求記録
};
```

WorkOrderはbunshin認可後に固定し、Workerには匿名化された必要最小の承認済み素材のみ渡す。人格/個人Memoryの生データを共有商品パックや別ユーザーに混ぜない。同一Revision再試行は入力hash、persona/pack/history/config版、演出決定と生成済み素材を固定し、失敗場面以外の内容を変えない。bunshinが所有権、認可、利用枠、原価台帳、Revision、通知、採用判断の正本。候補実行器は素材生成/合成の限定した結果を返すだけで、独自の顧客DB/通知/請求を持たない。単純な`renderProvider`追加では発注・状態・隔離・成果物検査まで解決しないため、先に契約テストで責務境界を確認する。現行Jobを優先し、独立キュー/Workerは長時間処理の実測で不可避な場合に限る。

## 障害注入と不変条件

| ケース                                              | 期待される回復・検査                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| submit送信後、応答が消えた                          | `UNKNOWN_SUBMISSION`として保留。Providerの冪等キー/照会で照合するまで再発注しない。照会不能なら人の判断へ |
| 同時二重実行、重複callback、逆順callback、lease切れ | operation keyと外部IDを一意に照合し、単調遷移、古い結果を棄却。二重請求を検出                             |
| 1場面のみ失敗                                       | 同じRevisionの成功済み素材とhashを再利用し、失敗場面だけ再開                                              |
| Provider成功後にStorage失敗                         | 外部ID・実原価を残し成果物の再取得/保存を先行、再生成しない                                               |
| 通知だけ失敗                                        | 完成Renderを保持し通知のみ再試行。再合成/再生成しない                                                     |
| キャンセル/契約停止/退会/削除要求                   | 新規発注停止、進行中の取消可否確認、出力/一時ファイル/署名URLの失効、実請求の保持                         |
| 署名URL期限切れ                                     | owner scopeを再認可してURLのみ再発行、素材生成は再実行しない                                              |
| 動画処理失敗                                        | 文章・画像の配信を阻害しない                                                                              |

顧客の月間動画利用枠は予約/確定/解放を既存方式で扱う。外部に発生した原価は利用枠を解放しても消さない。予算上限はstageごと・注文ごと・月間で判定し、無限再試行を禁止する。

## PoC 1：固定素材による接続可能性（実行は別承認）

- 入力：合成した架空ブランド名・ロゴ・CTA・必須表示、日本語字幕、ライセンスを確認した固定画像/動画/音声。個人情報、実顧客素材、本番資格情報は使用しない。10〜30秒縦長動画1仕様。ネットワークは原則遮断、依存とバイナリは固定・事前監査。
- 隔離：jobごとの使い捨てworkdir/cache/UID、読み取り専用入力、容量/CPU/メモリ/実行時間/プロセス上限、許可コマンドのみ。DB資格情報なし。成果物以外を明示削除し、削除前後のファイル一覧を記録。任意TSX・shellを外部入力として許可しない。
- テスト：起動/exit code/状態取得、同時2ジョブで素材と設定が混ざらないこと、意図的な中断/ディスク不足/期限切れ/不正パス/巨大ファイル、部分復帰、重複発注防止、出力MP4のffprobe・hash・所有範囲・画素/尺/字幕/音声、終了後の一時ファイル削除。Backlot状態APIだけで完了の正本にならない点も確認する。
- 合格条件：全ての重要な障害注入で越境・二重発注ゼロ、同一入力の再試行で承認済み内容不変、終了・状態・費用・成果物が機械判定できる、資源上限と削除が強制できる。不合格または要人手ならBの社内補助としてのみ再評価。実CPU/メモリ/ディスク/時間は計測値を残し、推測で容量設計しない。

## PoC 2：実API追加価値比較（別途の明示承認が必要）

- 比較設計：現行Creatomate＋必要な既存fal/KlingまたはRunwayと、C候補の限定工程を、同一の架空/使用許諾素材、同じ30秒縦長/解像度/日本語条件、同じ承認済みRevisionで比較。商品1つに対し異なる2ユーザー（ターゲット・話し方・履歴を変える）と、同一ユーザーの異なる2日/反応を用意。ランダムな言い換えでなく、対象・主張・構成の根拠ある差を盲検評価する。再試行は同じRevisionで内容固定。他ユーザーの人格/Memory/素材が出ないことを検査。
- 品質指標：商品名/ロゴ/CTA/必須表示の正確さ、日本語字幕・読み上げ同期、スマートフォンでの可読性、映像一貫性、人物/商品忠実度、手修正回数、承認までの時間、失敗/再試行率、stage別実原価、30日運用負荷。同一評価表で比較し「良くなった」を主観のみで宣言しない。
- 実API承認票に明記すべき項目：Provider名とモデル/版（既存fal/Kling、Runway、Creatomate、使用するならエージェントモデル）、各3ケース×2経路×最大2試行を上限とするか、総予算案USD 100とstage別上限、許諾素材一覧、匿名化方針、送信先ドメインと保存地域、通知先はテスト専用でLINE実送信なし、契約者/課金主体、停止責任者。数字は**提案上限**であり実料金/成功率ではない。承認者が確定するまで呼び出さない。
- 停止：予算上限到達、未知発注、越境/情報漏洩、権利不備、署名URL不正、繰り返し失敗、品質劣化、原価優位なし。結果が不明な注文は再実行しない。

初回PoCには長尺動画、複数Providerの一括導入、音楽生成、SNS自動投稿、全ユーザーへの日次提供を含めない。

## 原価モデル（公式公開単価の確認は2026-09-30 JST）

1本あたりの比較式：`企画/エージェント推論 + Σ(画像/動画素材生成) + 音声 + 合成 + CPU/メモリ/ディスク稼働 + Storage/転送 + ライセンス按分 + 失敗/再試行の実発生費`。利用枠の返却と実外部費は別列。為替・税・Provider割引・失敗課金条件は未確認。実測までは総額を算出しない。

- [fal Kling 2.5 Turbo Pro](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video)：参考モデルで5秒$0.35、追加1秒$0.07。**現行設定のモデルがこれとは限らない**ので発注前にモデルを固定。
- [Runway API](https://docs.dev.runwayml.com/guides/pricing/)：1 credit=$0.01、`gen4_turbo` 5 credits/秒、`gen4.5` 12 credits/秒。現行adapterの許可モデルと一致するが実契約単価は未確認。
- [Creatomate credit定義](https://creatomate.com/docs/account/how-are-credits-calculated)：動画は概ね`ceil(width×height×fps×秒/100,000,000)` credits（最低1）。720p/25fps/30秒は概算7 credits/本。金額は契約plan/超過単価に依存し未確認。[価格/保存](https://creatomate.com/pricing)も要再確認。
- [Remotion価格](https://www.remotion.dev/docs/license/pricing)：該当するAutomators区分なら$0.01/成功render、最低$100/月。OpenMontage導入時の契約区分は未確定。FFmpeg本体/コンピュート/転送は別。
- 企画LLM、TTS、Storage/転送、計算資源、フォント/楽曲、再試行は使用モデル・環境・契約未確定のため単価未確定。PoC前に公式価格の単位と取得日を再記録する。

| 比較用仮定 | 720p/25fps/30秒のCreatomate概算credit |    Remotion Automators該当時の公開最低/従量 | 同時実行・保存・運営の論点                   |
| ---------- | ------------------------------------: | ------------------------------------------: | -------------------------------------------- |
| 月100本    |                         約700 credits | 最低$100/月（成功100 renderなら従量$1相当） | 固定費の按分が大きい。保存30日等の実契約確認 |
| 月1,000本  |                       約7,000 credits |                  最低$100/月（従量$10相当） | 処理ピーク、Queue滞留、障害対応者            |
| 月10,000本 |                      約70,000 credits |           $100/月（従量$100相当、他費用別） | CPU/メモリ/ディスク/帯域と並列上限、削除運用 |

表は「各本が1回で成功し、追加素材/音声/失敗がない」**比較用仮定**で実績でも見積総額でもない。Creatomateの契約別$/credit、Remotion適用区分、計算資源・保存期間・同時実行・運営人件費は未確認。素材生成5秒を1場面追加するだけでもfal参考$0.35、Runway参考$0.25〜$0.60が1試行につく。成功率や失敗課金を作り込んだ数字にしない。
