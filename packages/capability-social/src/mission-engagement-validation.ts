import { missionString } from './mission-content';

export function missionIdempotencyKey(value: string) {
  return missionString(value, 200, 'idempotency key');
}
