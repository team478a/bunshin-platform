import type { ServiceAnnouncementSettings, ServiceSettingsValue } from './service-settings-types';

function dateTimeInputValue(value: string | null) {
  if (!value) return '';
  return new Date(value)
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

export function ServiceBasicsFields({
  value,
  businessFreeSettingsLocked,
  announcement,
}: {
  value: ServiceSettingsValue;
  businessFreeSettingsLocked: boolean;
  announcement: ServiceAnnouncementSettings;
}) {
  return (
    <>
      <label>
        サービス名
        <input name="displayName" required maxLength={120} defaultValue={value.displayName} />
      </label>
      <label>
        運営者名
        <input name="operatorName" required maxLength={160} defaultValue={value.operatorName} />
      </label>
      <label>
        サービスの説明
        <textarea
          name="description"
          required
          maxLength={1000}
          rows={4}
          defaultValue={value.description}
        />
      </label>
      <label>
        問い合わせメール
        <input
          name="contactEmail"
          type="email"
          maxLength={320}
          defaultValue={value.contactEmail ?? ''}
        />
      </label>
      <label>
        ロゴ画像URL
        <input
          name="logoUrl"
          type="url"
          defaultValue={value.brand.logoUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        アイコン画像URL
        <input
          name="iconUrl"
          type="url"
          defaultValue={value.brand.iconUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        ブラウザーアイコンURL
        <input
          name="faviconUrl"
          type="url"
          defaultValue={value.brand.faviconUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        メインカラー
        <input name="primaryColor" type="color" defaultValue={value.brand.primaryColor} />
      </label>
      <label>
        サブカラー
        <input name="secondaryColor" type="color" defaultValue={value.brand.secondaryColor} />
      </label>
      <label>
        文字の種類
        <select name="fontFamily" defaultValue={value.brand.fontFamily}>
          <option value="system-ui">読みやすい標準文字</option>
          <option value="sans-serif">すっきりした文字</option>
          <option value="serif">落ち着いた文字</option>
        </select>
      </label>
      <label>
        利用規約URL
        <input
          name="termsUrl"
          type="url"
          defaultValue={value.termsUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        プライバシーポリシーURL
        <input
          name="privacyUrl"
          type="url"
          defaultValue={value.privacyUrl ?? ''}
          placeholder="https://..."
        />
      </label>
      <label>
        新しい人の参加方法
        <select name="registrationMode" defaultValue={value.registration.mode}>
          <option value="INVITATION_ONLY">招待された人だけ</option>
          <option value="PUBLIC">誰でも参加できる</option>
          <option value="APPROVAL_REQUIRED">管理者が確認してから参加</option>
          <option value="CLOSED">新しい参加を止める</option>
        </select>
      </label>
      <fieldset>
        <legend>ログイン・参加に使う方法</legend>
        <label>
          <input
            name="emailEnabled"
            type="checkbox"
            defaultChecked={value.registration.emailEnabled}
          />{' '}
          メールを使う
        </label>
        <label>
          <input
            name="lineEnabled"
            type="checkbox"
            defaultChecked={value.registration.lineEnabled}
          />{' '}
          LINEを使う
        </label>
        <label>
          <input
            name="inviteCodeEnabled"
            type="checkbox"
            defaultChecked={!businessFreeSettingsLocked && value.registration.inviteCodeEnabled}
            disabled={businessFreeSettingsLocked}
          />{' '}
          招待コードを使う
        </label>
        <label>
          <input
            name="referralEnabled"
            type="checkbox"
            defaultChecked={!businessFreeSettingsLocked && value.registration.referralEnabled}
            disabled={businessFreeSettingsLocked}
          />{' '}
          紹介元を記録する
        </label>
        <small>メールだけ、LINEだけ、または両方を選べます。少なくとも一つを選んでください。</small>
      </fieldset>
      <fieldset>
        <legend>話題を使った投稿案</legend>
        <label>
          <input
            name="trendResearchEnabled"
            type="checkbox"
            defaultChecked={value.trendResearchEnabled ?? true}
          />{' '}
          今話題になっていることを、投稿案づくりに使う
        </label>
        <small>
          オフにすると、このサービスの新しい話題調査と、話題を使った投稿案への反映を止めます。すでに作られた投稿案は消えません。
        </small>
        <small>調査サービスや費用の設定は、システム管理者が管理します。</small>
      </fieldset>
      <fieldset>
        <legend>参加者へのお知らせ</legend>
        <label>
          <input name="announcementEnabled" type="checkbox" defaultChecked={announcement.enabled} />{' '}
          サービスホームにお知らせを表示する
        </label>
        <label>
          見出し
          <input
            name="announcementTitle"
            maxLength={120}
            defaultValue={announcement.title}
            placeholder="例：今週の投稿テーマについて"
          />
        </label>
        <label>
          内容
          <textarea
            name="announcementMessage"
            maxLength={1000}
            rows={4}
            defaultValue={announcement.message}
            placeholder="参加者に伝えたいことを、やさしい言葉で書きます。"
          />
        </label>
        <label>
          表示を始める日時（空欄ならすぐ表示）
          <input
            name="announcementStartsAt"
            type="datetime-local"
            defaultValue={dateTimeInputValue(announcement.startsAt)}
          />
        </label>
        <label>
          表示を終える日時（空欄なら表示を続ける）
          <input
            name="announcementEndsAt"
            type="datetime-local"
            defaultValue={dateTimeInputValue(announcement.endsAt)}
          />
        </label>
        <small>
          日本時間で予約できます。メンテナンスや今週の案内に使えます。表示を止めると参加者のホームから非表示になります。LINE送信や機能停止は行いません。
        </small>
      </fieldset>
    </>
  );
}
