# OpenMontage ライセンス・運用リスク確認（法的意見ではない）

対象固定commit：bunshin `29f0f92b056870ccb895692ac8c33873d2d818f2`、OpenMontage `08e2151fa02de28a5d6a312b3d575692bf147ad7`。確認日時：2026-09-30 JST。これは採用判断の論点整理であり、法律上の最終判断ではない。商用SaaS/OEMへの取り込み許可ではない。

## 確認済みのライセンスと利用形態

採用対象commitの[LICENSE](https://github.com/calesthio/OpenMontage/blob/08e2151fa02de28a5d6a312b3d575692bf147ad7/LICENSE)はAGPLv3。商用利用そのものは禁止していないが、複製・改変・配布、改変版のネットワーク提供の義務を個別に評価する必要がある。[GNU FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)および[AGPLの説明](https://www.gnu.org/licenses/why-affero-gpl.html)を参照。「別Workerなら自動的に解決」「ワタシワークス全体が必ず公開対象」とも断定できない。プロセス境界、結合・改変の態様、ネットワーク利用者と提供形態を弁護士・権利者と確認する。

| 利用形態                        | 現段階の見方                             | 必要な確認                                                     |
| ------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| 本部社内の有人制作ツール        | 製品組込より狭いが無条件ではない         | 社内配布、改変、素材・出力の権利、agent契約                    |
| 本部運営の外部Worker            | ネットワーク越しの利用と改変版提供を検討 | AGPL第13条の適用、利用者へのソース提供範囲、プロセス分離の実態 |
| 顧客向けSaaSに組込              | ユーザーが機能を利用する形態             | 結合著作物/対応ソース範囲、通知/提供手段、契約                 |
| OEM先へソフトウェア配布         | 配布義務が直接問題になる                 | 対応ソース・ライセンス告知、再配布/OEM契約、各依存の条件       |
| コード/skill/templateの部分利用 | コピー対象の由来・創作性で変わる         | ファイル単位の権利/表示/継承、独立実装との区別                 |

OpenMontageの[`remotion-composer/package.json`](https://github.com/calesthio/OpenMontage/blob/08e2151fa02de28a5d6a312b3d575692bf147ad7/remotion-composer/package.json)はRemotion系4.xを要求する。実利用バージョンはlockfile・導入時の固定が必要。Remotionは通常のMIT前提で扱えない。[公式ライセンス/価格](https://www.remotion.dev/docs/license/pricing)と[FAQ](https://www.remotion.dev/docs/license/faq)によれば、少人数向け無料条件と4人以上のCompany License、Automators（公開価格は$0.01/成功render、最低$100/月）の区分がある。2026-09-30参照時点の公開情報であり、組織人数・SaaS/OEM/自動化の実態をRemotion側に確認する。価格は将来変動する。

[FFmpeg公式法務案内](https://ffmpeg.org/legal.html)では通常LGPLv2.1以降だが、GPL部品を有効化するとGPL条件が適用される。`tools/video/video_compose.py` は`ffmpeg`をsubprocessで呼び、実バイナリのconfigureオプション、codec（例：libx264）、フォント同梱/配布状況は未確認。使用バイナリ・フォントのライセンス証跡が必要。Python `setup.py` のPyYAML/Pydantic/jsonschema/python-dotenv/Pillow/requests/google-genai/openai等、Remotionのnpm lockfile、各Provider SDKと間接依存のSBOM・ライセンス照合は未完了。契約・版・配布先を決めてから再監査する。

モデル、音声、BGM、画像/動画、ロゴ、商品表示・人物肖像はOpenMontageのコードライセンスとは別。Providerの商用/OEM利用、学習・保存・再配布、生成物帰属、AI表示、利用地域、著作権・商標・肖像/声の同意を素材ごとに確認する。共通商品パックと個人メモリー/ユーザー素材は所有者と共有範囲が異なる。

## 無人実行・安全性の差分

OpenMontageの[architecture](https://github.com/calesthio/OpenMontage/blob/08e2151fa02de28a5d6a312b3d575692bf147ad7/docs/ARCHITECTURE.md)はIDEエージェントがYAML/skillに従いPython toolsを選択する開発時フロー。`backlot/__main__.py` はboard開閉/serve、`backlot/server.py:170-290` は状態/媒体の読取HTTP。統一的な「無人制作開始→終了→キャンセル→外部発注照合」APIは確認できない。`pipeline_defs/cinematic.yaml` には人の承認が既定のstageがある。Codexで開発者が実行できることは、SaaSが非対話・上限付き・監査可能に実行できることを意味しない。

`tools/tool_registry.py` は環境`.env`をプロセスへ読み込みtool moduleを動的importする。`tools/video/video_compose.py:933-1112,1944-2135` はローカルパス、Node/Remotion/FFmpeg subprocess、project固有のTSXを使う。共有プロセス/ディレクトリ/キャッシュを無加工で複数テナントへ渡すのは不可。導入するならジョブごとに使い捨て作業ディレクトリ・キャッシュ・プロセス/コンテナを分け、読み取り可能素材を明示的に絞る。広い本番DB資格情報、他テナントのStorage URL、全Provider鍵を渡さない。外部通信は許可先のみ、実行可能コマンドと依存追加を禁止/固定し、CPU/メモリ/ディスク/時間/出力容量を制限する。`projects/`とBacklot media endpointの既存パス検査は存在するが、顧客向け認可と全tool入力の安全証明ではない。

| 脅威                                   | 必要な設計・検証                                               | 現段階                                  |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| SSRF/不正URL、署名URL失効              | URL host/redirect/IP検査、短期署名URLを実行直前に再発行        | OM全toolでは未確認                      |
| path traversal/symlink、成果物取り違え | job root正規化、symlink拒否、成果物をbunshin所有スコープへ照合 | Backlot一部に検査あり、end-to-end未確認 |
| command/prompt injection、任意TSX      | shell禁止、固定コマンド、編集可能コードをSaaS入力にしない      | sandbox未確認                           |
| 巨大ファイル/zip bomb/無制限再試行     | byte・長さ・画素・frame・stage試行・予算上限                   | 統合上限未確認                          |
| 秘密/人格/個人メモリーのログ漏洩       | 入力最小化・redaction・ログ保存期間、横断アクセス試験          | 未確認                                  |
| 外部発注の二重請求                     | 一意operation key、照会・保留・手動介入状態                    | OM単独では未確認                        |
| 成果物権利/実体不一致                  | MIME/ffprobe/hash/期待仕様、ロゴ・CTA・必須表示・音声検査      | 実Provider出力未確認                    |

## 失敗・原価・二重発注の停止条件

既存bunshinのJobと利用枠は正本として維持する。`packages/application/src/video-ai-scene-generation.ts:258-273` および `video-render-execution.ts:65-120` はProvider submit後に外部IDを記録する。submit成功・応答喪失、または応答受信後DB保存失敗の窓では発注成否が不明になり得る。実Providerに冪等キーか検索/照合APIがない限り**QUEUEDへ戻して無条件再発注しない**。`UNKNOWN_SUBMISSION`相当の保留状態・運用照合を設計すること。既存コードの欠陥確定ではなく、障害注入未確認のリスクである。

重複callback・逆順イベントはProject/Revision/Scene/attemptを照合して単調な状態遷移とし、lease失効後の二重WorkerもDB一意制約だけで安心しない。成功済み場面はstorage key/hash/権利を確認して再利用。生成成功→保存失敗は外部IDと実原価を残して再取得を優先する。通知失敗は通知Job/状態のみ再試行し動画を再生成しない（現行 `video-render-execution.ts:60-61` はSUCCEEDED短絡）。キャンセル/契約停止/退会/削除要求時は新規発注停止、進行中処理の可否確認、鍵失効・成果物削除・料金精算を分ける。利用枠返却は外部で既に発生した原価の取消しを意味しない。現行の `packages/database/src/video-render-operations.ts:309-324` はAI場面の管理者再試行で `actualCostUsdMicros: null` に更新する。今回確認範囲ではProvider請求からの実額設定経路も見つからず、別途請求証跡がないままこの値を原価台帳とみなすことはできない。

**採用を止める条件**：商用SaaS/OEMのAGPL/Remotion/FFmpeg/素材条件を満たす方針が定まらない、利用者に提供すべきソース範囲を許容できない、無人運転の資格・権限/契約がない、テナント隔離・任意コード制限を証明できない、発注不明時に照合不能で二重課金を抑止できない、実原価上限を強制できない、既存経路より測定可能な価値がない。

## 専門家・権利者へ確認する事項と代替

1. 弁護士/OpenMontage権利者：改変版のネットワーク提供とOEM配布時の対応ソース範囲、部分利用の帰属、別プロセス連携の扱い。
2. Remotion：予定する自動化・組織規模・OEM再配布のライセンスと計数、顧客別請求の可否。
3. FFmpeg配布担当：実ビルドのconfigure/SBOM、GPL codec、フォント・字幕ライブラリの条件。
4. 各Provider/モデル/素材権利者：商用/OEM、入力データ、生成物、音声/楽曲/肖像、保存・削除、日次大量実行の契約。
5. セキュリティ/運用責任者：ジョブ隔離、最小資格情報、外部通信制限、事故時削除/監査。

代替はA（既存Creatomate/fal/Runway経路の改善）、または本部内で人が承認するB。権利が未解決でも[差分](OPENMONTAGE_GAP_ANALYSIS.md)、[PoC計画](OPENMONTAGE_POC_PLAN.md)、[バックログ](OPENMONTAGE_IMPLEMENTATION_BACKLOG.md)は調査成果として作成する。追加の導入作業は承認まで実施しない。
