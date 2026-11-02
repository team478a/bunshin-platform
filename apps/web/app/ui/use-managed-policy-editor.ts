'use client';
import { useRef, useState, type FormEvent } from 'react';
interface PolicyView<S> {
  revision: number;
  headquarters: S | null;
  service: S | null;
  effective: S;
  permissions: { headquarters: boolean; service: boolean };
}
/** Stable retry receipt and revision checks shared by product management forms. */
export function useManagedPolicyEditor<S, V extends PolicyView<S>>({
  endpoint,
  initial,
  defaults,
  normalize,
  parseResponse,
}: {
  endpoint: string;
  initial: V;
  defaults: () => S;
  normalize: (value: unknown) => S;
  parseResponse: (response: Response) => Promise<V>;
}) {
  const [value, setValue] = useState(initial);
  const [authority, setAuthority] = useState<'HEADQUARTERS' | 'SERVICE'>(
    initial.permissions.headquarters ? 'HEADQUARTERS' : 'SERVICE',
  );
  const [settings, setSettings] = useState(
    initial.permissions.headquarters ? (initial.headquarters ?? defaults()) : initial.effective,
  );
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const receipt = useRef<{ body: string; commandId: string } | null>(null);
  const canSave =
    !denied &&
    (authority === 'HEADQUARTERS'
      ? value.permissions.headquarters
      : value.permissions.service && value.headquarters !== null);
  async function read() {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      if ([401, 403, 404].includes(response.status)) {
        setDenied(true);
        throw new Error('現在の管理権限を確認してください。');
      }
      if (!response.ok) throw new Error('設定を取得できませんでした。');
      const parsed = await parseResponse(response);
      setValue(parsed);
      setSettings(
        authority === 'HEADQUARTERS' ? (parsed.headquarters ?? defaults()) : parsed.effective,
      );
      receipt.current = null;
      setMessage('最新の設定を取得しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を取得できませんでした。');
    } finally {
      setPending(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canSave) return;
    setPending(true);
    setMessage('');
    try {
      const normalized = normalize(settings);
      const body = JSON.stringify({
        expectedRevision: value.revision,
        authority,
        settings: normalized,
        reason: reason.trim(),
      });
      if (receipt.current?.body !== body)
        receipt.current = { body, commandId: crypto.randomUUID() };
      const response = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(JSON.parse(body) as object),
          commandId: receipt.current.commandId,
        }),
      });
      if ([401, 403, 404].includes(response.status)) {
        setDenied(true);
        throw new Error('管理権限または本部の許可条件を確認し、ページを開き直してください。');
      }
      if (response.status === 409)
        throw new Error(
          '他の変更が反映されています。「最新の設定を取得」で確認してから保存してください。',
        );
      if (!response.ok) throw new Error('保存できませんでした。条件を確認して再度お試しください。');
      const parsed = await parseResponse(response);
      if (parsed.revision !== value.revision + 1)
        throw new Error('保存した版を確認できません。最新の設定を取得してください。');
      const savedSettings = authority === 'HEADQUARTERS' ? parsed.headquarters : parsed.service;
      if (!savedSettings || JSON.stringify(normalize(savedSettings)) !== JSON.stringify(normalized))
        throw new Error('保存した条件を確認できません。最新の設定を取得してください。');
      setValue(parsed);
      receipt.current = null;
      setReason('');
      setMessage('設定を保存しました。変更は監査記録に残しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を保存できませんでした。');
    } finally {
      setPending(false);
    }
  }
  return {
    value,
    authority,
    setAuthority,
    settings,
    setSettings,
    reason,
    setReason,
    message,
    setMessage,
    pending,
    denied,
    canSave,
    read,
    save,
  };
}
