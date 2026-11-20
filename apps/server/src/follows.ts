import type { Db } from "./db.ts";

export interface FollowCounts {
  followers: number;
  following: number;
  mutual: number;
}

function count(db: Db, sql: string, ...params: Array<string | number>): number {
  const row = db.prepare(sql).get(...params) as { n?: number } | undefined;
  return row?.n ?? 0;
}

/** 某个用户的粉丝数 / 关注数 / 互相关注数。 */
export function followCounts(db: Db, userId: number): FollowCounts {
  return {
    followers: count(
      db,
      "SELECT COUNT(*) AS n FROM follows WHERE following_id = ?",
      userId,
    ),
    following: count(
      db,
      "SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?",
      userId,
    ),
    mutual: count(
      db,
      "SELECT COUNT(*) AS n FROM follows a JOIN follows b " +
        "ON b.follower_id = a.following_id AND b.following_id = a.follower_id " +
        "WHERE a.follower_id = ?",
      userId,
    ),
  };
}

export function isFollowing(
  db: Db,
  followerId: number,
  followingId: number,
): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM follows WHERE follower_id = ? AND following_id = ?")
    .get(followerId, followingId) as { ok?: number } | undefined;
  return Boolean(row);
}

/** 我关注的所有用户 id（列表里给每条数据打「已关注」标记用）。 */
export function followingIds(db: Db, followerId: number): number[] {
  const rows = db
    .prepare("SELECT following_id FROM follows WHERE follower_id = ?")
    .all(followerId) as Array<{ following_id: number }>;
  return rows.map((row) => row.following_id);
}

export function followUser(db: Db, followerId: number, followingId: number): void {
  db.prepare(
    "INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)",
  ).run(followerId, followingId, Date.now());
}

export function unfollowUser(db: Db, followerId: number, followingId: number): void {
  db.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").run(
    followerId,
    followingId,
  );
}
