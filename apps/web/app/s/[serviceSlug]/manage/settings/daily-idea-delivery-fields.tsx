import type { Dispatch, SetStateAction } from 'react';
import type {
  AudioTrackOption,
  DailyIdeaDeliverySettings,
  VisualCharacterOption,
} from './service-settings-types';

export function DailyIdeaDeliveryFields({
  serviceSlug,
  businessFreeSettingsLocked,
  businessProfileEnabled,
  setBusinessProfileEnabled,
  dailyIdeaDelivery,
  setDailyIdeaDelivery,
  visualCharacters,
  audioTracks,
}: {
  serviceSlug: string;
  businessFreeSettingsLocked: boolean;
  businessProfileEnabled: boolean;
  setBusinessProfileEnabled: Dispatch<SetStateAction<boolean>>;
  dailyIdeaDelivery: DailyIdeaDeliverySettings;
  setDailyIdeaDelivery: Dispatch<SetStateAction<DailyIdeaDeliverySettings>>;
  visualCharacters: VisualCharacterOption[];
  audioTracks: AudioTrackOption[];
}) {
  return (
    <section className="settings-card">
      <h3>企業向けの毎日配信</h3>
      <p>有効にすると、業種と会社情報をサービスごとに保存し、投稿案づくりに使用します。</p>
      <label>
        <input
          type="checkbox"
          checked={businessProfileEnabled}
          disabled={businessFreeSettingsLocked}
          onChange={(event) => setBusinessProfileEnabled(event.target.checked)}
        />{' '}
        サービス専用の企業プロフィールを登録する
      </label>
      {businessFreeSettingsLocked && (
        <p className="notice">
          無料運用では「毎日・完成した投稿文・文章のみ・LINE配信」に固定されます。画像・動画は有料機能の準備が完了してから追加します。
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={dailyIdeaDelivery.enabled}
          disabled={businessFreeSettingsLocked}
          onChange={(event) =>
            setDailyIdeaDelivery((current) => ({ ...current, enabled: event.target.checked }))
          }
        />{' '}
        発信アイデアの自動配信を使う
      </label>
      <label>
        配信頻度
        <select
          value={dailyIdeaDelivery.cadence}
          disabled={businessFreeSettingsLocked}
          onChange={(event) =>
            setDailyIdeaDelivery((current) => ({
              ...current,
              cadence: event.target.value === 'WEEKDAYS' ? 'WEEKDAYS' : 'DAILY',
            }))
          }
        >
          <option value="DAILY">毎日</option>
          <option value="WEEKDAYS">平日のみ</option>
        </select>
      </label>
      <label>
        初期のお届け時刻
        <input
          type="time"
          min="07:00"
          max="20:59"
          value={dailyIdeaDelivery.defaultNotificationTime}
          onChange={(event) =>
            setDailyIdeaDelivery((current) => ({
              ...current,
              defaultNotificationTime: event.target.value,
            }))
          }
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={dailyIdeaDelivery.lockCadence}
          disabled={businessFreeSettingsLocked}
          onChange={(event) =>
            setDailyIdeaDelivery((current) => ({
              ...current,
              lockCadence: event.target.checked,
            }))
          }
        />{' '}
        利用者に投稿ペースを選ばせず、この頻度を使う
      </label>
      <label>
        届ける内容
        <select
          value={dailyIdeaDelivery.contentMode}
          disabled={businessFreeSettingsLocked}
          onChange={(event) =>
            setDailyIdeaDelivery((current) => ({
              ...current,
              contentMode:
                event.target.value === 'IDEA' || event.target.value === 'PROMPT'
                  ? event.target.value
                  : 'READY_TO_USE',
            }))
          }
        >
          <option value="IDEA">発信アイデア</option>
          <option value="PROMPT">作り方・台本・配信用プロンプト</option>
          <option value="READY_TO_USE">そのまま使える投稿案</option>
        </select>
      </label>
      <p>
        ここで選ぶ内容はサービスの初期値です。「公式プログラム」で参加者へ別の内容を割り当てた場合は、参加者ごとの設定を優先します。
      </p>
      <label>
        自動で準備する画像・動画
        <select
          value={dailyIdeaDelivery.mediaMode}
          disabled={businessFreeSettingsLocked}
          onChange={(event) =>
            setDailyIdeaDelivery((current) => ({
              ...current,
              mediaMode:
                event.target.value === 'VIDEO' ||
                event.target.value === 'IMAGE_AND_VIDEO' ||
                event.target.value === 'IMAGE'
                  ? event.target.value
                  : 'TEXT_ONLY',
              ...(!['IMAGE', 'IMAGE_AND_VIDEO'].includes(event.target.value)
                ? {
                    visualCharacter: {
                      ...current.visualCharacter,
                      enabled: false,
                    },
                  }
                : {}),
            }))
          }
        >
          <option value="TEXT_ONLY">文章だけ届ける</option>
          <option value="IMAGE">画像・スライド形式の日は確認用画像も届ける</option>
          <option value="VIDEO">投稿文から30秒の字幕動画を準備する</option>
          <option value="IMAGE_AND_VIDEO">画像と30秒の字幕動画を準備する</option>
        </select>
      </label>
      <small>
        画像は完成原稿プラン、画像作成枠、画像Pilotと参加者の同意がすべて有効な場合だけ自動作成します。字幕動画は動画作成枠と動画機能が有効な場合に準備し、完成後にLINEで確認リンクを届けます。送信後も投稿前の確認が必要です。
      </small>
      {dailyIdeaDelivery.mediaMode === 'IMAGE' ||
      dailyIdeaDelivery.mediaMode === 'IMAGE_AND_VIDEO' ? (
        <fieldset>
          <legend>投稿画像に使うAIキャラクター</legend>
          {visualCharacters.length > 0 ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={dailyIdeaDelivery.visualCharacter.enabled}
                  onChange={(event) =>
                    setDailyIdeaDelivery((current) => ({
                      ...current,
                      visualCharacter: {
                        ...current.visualCharacter,
                        enabled: event.target.checked,
                        profileVersionId:
                          current.visualCharacter.profileVersionId ??
                          visualCharacters[0]?.id ??
                          null,
                      },
                    }))
                  }
                />{' '}
                毎日の投稿画像に同じAIキャラクターを登場させる
              </label>
              {dailyIdeaDelivery.visualCharacter.enabled ? (
                <label>
                  キャラクター
                  <select
                    value={dailyIdeaDelivery.visualCharacter.profileVersionId ?? ''}
                    onChange={(event) =>
                      setDailyIdeaDelivery((current) => ({
                        ...current,
                        visualCharacter: {
                          enabled: true,
                          profileVersionId: event.target.value || null,
                        },
                      }))
                    }
                  >
                    {visualCharacters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}（第{character.version}版）
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : (
            <p>公開済みのAIキャラクターと基準画像を登録すると、ここで選べるようになります。</p>
          )}
          <small>
            キャラクターの基準画像を、5枚投稿画像の見た目をそろえるために使います。参加者が自分の写真を明示的に選んでいる場合は、その写真を優先します。
          </small>
        </fieldset>
      ) : null}
      {dailyIdeaDelivery.mediaMode === 'VIDEO' ||
      dailyIdeaDelivery.mediaMode === 'IMAGE_AND_VIDEO' ? (
        <fieldset>
          <legend>動画の動き</legend>
          <label>
            見せ方
            <select
              value={dailyIdeaDelivery.videoStyle}
              onChange={(event) =>
                setDailyIdeaDelivery((current) => ({
                  ...current,
                  videoStyle:
                    event.target.value === 'CALM' || event.target.value === 'MINIMAL'
                      ? event.target.value
                      : 'STANDARD',
                }))
              }
            >
              <option value="STANDARD">標準（横から切り替わる）</option>
              <option value="CALM">ゆったり（動きを小さくする）</option>
              <option value="MINIMAL">動きなし（画像をそのまま見せる）</option>
            </select>
          </label>
          <small>
            文字を読みやすくしたい場合は「ゆったり」か「動きなし」を選んでください。次に作る動画から反映されます。
          </small>
        </fieldset>
      ) : null}
      {dailyIdeaDelivery.mediaMode === 'VIDEO' ||
      dailyIdeaDelivery.mediaMode === 'IMAGE_AND_VIDEO' ? (
        <fieldset>
          <legend>動画のBGM</legend>
          {audioTracks.length > 0 ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={dailyIdeaDelivery.videoBgm.enabled}
                  onChange={(event) =>
                    setDailyIdeaDelivery((current) => ({
                      ...current,
                      videoBgm: {
                        ...current.videoBgm,
                        enabled: event.target.checked,
                        assetId: current.videoBgm.assetId ?? audioTracks[0]?.id ?? null,
                      },
                    }))
                  }
                />{' '}
                権利確認済みのBGMを入れる
              </label>
              {dailyIdeaDelivery.videoBgm.enabled ? (
                <>
                  <label>
                    BGM
                    <select
                      value={dailyIdeaDelivery.videoBgm.assetId ?? ''}
                      onChange={(event) =>
                        setDailyIdeaDelivery((current) => ({
                          ...current,
                          videoBgm: {
                            ...current.videoBgm,
                            assetId: event.target.value || null,
                          },
                        }))
                      }
                    >
                      {audioTracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.originalFilename}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    BGMの音量
                    <select
                      value={dailyIdeaDelivery.videoBgm.volumePercent}
                      onChange={(event) =>
                        setDailyIdeaDelivery((current) => ({
                          ...current,
                          videoBgm: {
                            ...current.videoBgm,
                            volumePercent: Number(event.target.value),
                          },
                        }))
                      }
                    >
                      <option value={8}>小さめ</option>
                      <option value={12}>おすすめ</option>
                      <option value={20}>やや大きめ</option>
                    </select>
                  </label>
                </>
              ) : null}
            </>
          ) : (
            <p>
              <a href={`/s/${serviceSlug}/video-assets`}>BGMを保存する</a>
              と、ここで選べるようになります。
            </p>
          )}
          <small>自分で使用権を確認したMP3・WAVだけを使用してください。</small>
        </fieldset>
      ) : null}
      {dailyIdeaDelivery.mediaMode === 'IMAGE_AND_VIDEO' ? (
        <fieldset>
          <legend>5枚画像動画の読み上げ</legend>
          <label>
            <input
              type="checkbox"
              checked={dailyIdeaDelivery.videoNarration.enabled}
              onChange={(event) =>
                setDailyIdeaDelivery((current) => ({
                  ...current,
                  videoNarration: {
                    ...current.videoNarration,
                    enabled: event.target.checked,
                  },
                }))
              }
            />{' '}
            投稿画像の要点をAI音声で読み上げる
          </label>
          {dailyIdeaDelivery.videoNarration.enabled ? (
            <>
              <label>
                声
                <select
                  value={dailyIdeaDelivery.videoNarration.voice}
                  onChange={(event) =>
                    setDailyIdeaDelivery((current) => ({
                      ...current,
                      videoNarration: {
                        ...current.videoNarration,
                        voice: event.target.value as 'marin' | 'cedar' | 'coral',
                      },
                    }))
                  }
                >
                  <option value="marin">やさしく落ち着いた声</option>
                  <option value="cedar">はっきり信頼感のある声</option>
                  <option value="coral">明るく親しみやすい声</option>
                </select>
              </label>
              <label>
                速さ
                <select
                  value={dailyIdeaDelivery.videoNarration.speed}
                  onChange={(event) =>
                    setDailyIdeaDelivery((current) => ({
                      ...current,
                      videoNarration: {
                        ...current.videoNarration,
                        speed: event.target.value === 'STANDARD' ? 'STANDARD' : 'SLOW',
                      },
                    }))
                  }
                >
                  <option value="SLOW">ゆっくり（聞き取りやすい）</option>
                  <option value="STANDARD">標準</option>
                </select>
              </label>
            </>
          ) : null}
          <small>
            各画像の見出しと説明から、表示時間に収まる短い台本を自動で作ります。AI音声の利用分が加算されます。既存サービスでは初期状態はオフです。
          </small>
        </fieldset>
      ) : null}
    </section>
  );
}
