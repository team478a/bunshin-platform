import type {
  InstructorReviewProduct,
  InstructorReviewStatus,
} from '../services/instructor-review-contract';
import { instructorReviewStatusLabel } from '../services/instructor-review-contract';

type Choice = { id: string; label: string };
type ServerAction = (formData: FormData) => void | Promise<void>;
type ReviewRow = {
  id: string;
  title: string;
  instructorUserId: string | null;
  status: InstructorReviewStatus;
  dueAt: Date | null;
};

export function InstructorReviewProductSettings({
  action,
  product,
  programs,
  instructors,
}: {
  action: ServerAction;
  product: InstructorReviewProduct | null;
  programs: Choice[];
  instructors: Choice[];
}) {
  return (
    <section className="settings-card">
      <h2>講師レビューの受付設定</h2>
      <form action={action} className="form-stack">
        <label>
          <input type="checkbox" name="enabled" defaultChecked={product?.enabled} />
          受付を開始する
        </label>
        <fieldset className="form-stack">
          <legend>対象の研修プログラム</legend>
          {programs.map((program) => (
            <label key={program.id}>
              <input
                type="checkbox"
                name="programIds"
                value={program.id}
                defaultChecked={product?.programIds.includes(program.id)}
              />
              {program.label}
            </label>
          ))}
        </fieldset>
        <label className="field">
          税込価格（円）
          <input
            name="priceYen"
            type="number"
            min={50}
            max={99_999_999}
            required
            defaultValue={product?.priceYen}
          />
        </label>
        <label className="field">
          提供内容
          <textarea
            name="description"
            maxLength={1000}
            required
            defaultValue={product?.description}
          />
        </label>
        <label className="field">
          回答の目安（決済完了から何時間以内）
          <input
            name="responseHours"
            type="number"
            min={1}
            max={8760}
            required
            defaultValue={product?.responseHours}
          />
        </label>
        <label className="field">
          キャンセル条件
          <textarea
            name="cancellationTerms"
            maxLength={500}
            required
            defaultValue={product?.cancellationTerms}
          />
        </label>
        <label className="field">
          同時受付上限
          <input
            name="capacity"
            type="number"
            min={1}
            max={1000}
            required
            defaultValue={product?.capacity}
          />
        </label>
        <fieldset className="form-stack">
          <legend>担当可能な講師</legend>
          {instructors.map((instructor) => (
            <label key={instructor.id}>
              <input
                type="checkbox"
                name="instructorUserIds"
                value={instructor.id}
                defaultChecked={product?.instructorUserIds.includes(instructor.id)}
              />
              {instructor.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="button button--primary">
          受付設定を保存する
        </button>
      </form>
    </section>
  );
}

export function InstructorReviewQueue({
  rows,
  instructors,
  assignableInstructorIds,
  assign,
  refund,
}: {
  rows: ReviewRow[];
  instructors: Choice[];
  assignableInstructorIds: string[];
  assign: ServerAction;
  refund: ServerAction;
}) {
  const assignable = instructors.filter(({ id }) => assignableInstructorIds.includes(id));
  return (
    <section className="settings-card">
      <h2>講師レビューの受付一覧</h2>
      {rows.length === 0 && <p>依頼はまだありません。</p>}
      {rows.map((review) => (
        <article className="settings-card" key={review.id}>
          <h3>{review.title}</h3>
          <dl>
            <dt>対応状況</dt>
            <dd>{instructorReviewStatusLabel[review.status]}</dd>
            <dt>担当講師</dt>
            <dd>
              {instructors.find(({ id }) => id === review.instructorUserId)?.label ??
                (review.instructorUserId ? '登録解除済みの講師' : '未割当')}
            </dd>
            <dt>回答期限</dt>
            <dd>
              {review.dueAt
                ? new Intl.DateTimeFormat('ja-JP', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Tokyo',
                  }).format(review.dueAt)
                : '決済確定後に表示'}
            </dd>
          </dl>
          {(review.status === 'ACCEPTED' || review.status === 'IN_PROGRESS') && (
            <form className="form-stack" action={assign}>
              <input type="hidden" name="reviewId" value={review.id} />
              <label className="field">
                担当講師を選ぶ
                <select
                  name="instructorUserId"
                  required
                  defaultValue={review.instructorUserId ?? ''}
                >
                  <option value="">担当講師を選択</option>
                  {assignable.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button" disabled={assignable.length === 0}>
                担当を保存
              </button>
            </form>
          )}
          {['ACCEPTED', 'IN_PROGRESS', 'REFUND_PENDING'].includes(review.status) && (
            <details>
              <summary>返金の手続き</summary>
              <form action={refund}>
                <input type="hidden" name="reviewId" value={review.id} />
                <button type="submit" className="button">
                  {review.status === 'REFUND_PENDING'
                    ? '返金処理を再試行する'
                    : '全額返金を依頼する'}
                </button>
              </form>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
