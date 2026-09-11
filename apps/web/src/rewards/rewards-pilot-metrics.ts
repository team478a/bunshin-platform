const TEN_MINUTES_MS = 10 * 60 * 1000;

export type RewardsPilotPost = {
  userId: string;
  postedAt: Date;
};

export type RewardsPilotTransaction = {
  userId: string;
  type: 'GRANT' | 'CONSUME';
  amount: number;
};

export type RewardsPilotReviewCandidate = {
  userId: string;
  reasons: string[];
};

export type RewardsPilotMetrics = {
  participantCount: number;
  postingUserCount: number;
  continuedUserCount: number;
  redemptionUserCount: number;
  postCount: number;
  grantedPoints: number;
  consumedPoints: number;
  reviewCandidates: RewardsPilotReviewCandidate[];
};

function localDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function buildRewardsPilotMetrics(input: {
  participantIds: string[];
  posts: RewardsPilotPost[];
  transactions: RewardsPilotTransaction[];
  timezone?: string;
}): RewardsPilotMetrics {
  const timezone = input.timezone ?? 'Asia/Tokyo';
  const participants = new Set(input.participantIds);
  const posts = input.posts.filter((post) => participants.has(post.userId));
  const transactions = input.transactions.filter((item) => participants.has(item.userId));
  const postsByUser = new Map<string, RewardsPilotPost[]>();

  for (const post of posts) {
    const current = postsByUser.get(post.userId) ?? [];
    current.push(post);
    postsByUser.set(post.userId, current);
  }

  const continuedUsers = new Set<string>();
  const reviewCandidates: RewardsPilotReviewCandidate[] = [];
  for (const [userId, userPosts] of postsByUser) {
    const sorted = [...userPosts].sort(
      (left, right) => left.postedAt.valueOf() - right.postedAt.valueOf(),
    );
    const dailyCounts = new Map<string, number>();
    for (const post of sorted) {
      const date = localDate(post.postedAt, timezone);
      dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
    }
    if (dailyCounts.size >= 3) continuedUsers.add(userId);

    const reasons: string[] = [];
    const busyDay = [...dailyCounts].find(([, count]) => count >= 5);
    if (busyDay) reasons.push(`${busyDay[0]}に投稿完了を${busyDay[1]}件記録`);
    if (
      sorted.some(
        (post, index) =>
          index >= 2 &&
          post.postedAt.valueOf() - sorted[index - 2]!.postedAt.valueOf() <= TEN_MINUTES_MS,
      )
    ) {
      reasons.push('10分以内に投稿完了を3件以上記録');
    }
    if (reasons.length > 0) reviewCandidates.push({ userId, reasons });
  }

  const redemptionUsers = new Set(
    transactions.filter((item) => item.type === 'CONSUME').map((item) => item.userId),
  );

  return {
    participantCount: participants.size,
    postingUserCount: postsByUser.size,
    continuedUserCount: continuedUsers.size,
    redemptionUserCount: redemptionUsers.size,
    postCount: posts.length,
    grantedPoints: transactions
      .filter((item) => item.type === 'GRANT')
      .reduce((total, item) => total + Math.max(0, item.amount), 0),
    consumedPoints: transactions
      .filter((item) => item.type === 'CONSUME')
      .reduce((total, item) => total + Math.abs(item.amount), 0),
    reviewCandidates,
  };
}
