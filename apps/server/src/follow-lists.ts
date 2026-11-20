import type { Db } from "./db.ts";
import { displayName, gradientFor } from "./activity.ts";
import { followingIds } from "./follows.ts";
import type {
  FollowEntry,
  FollowList,
} from "../../../packages/shared/src/api-types.ts";
import type { ProfileUser } from "./profiles.ts";

export type FollowKind = "followers" | "following";

interface FollowRow {
  id: number;
  address: string;
  x_name: string | null;
  x_handle: string | null;
  followers: number;
}

const FOLLOWERS_SQL =
  "SELECT u.id AS id, u.address AS address, u.x_name AS x_name, u.x_handle AS x_handle, " +
  "(SELECT COUNT(*) FROM follows c WHERE c.following_id = u.id) AS followers " +
  "FROM follows f JOIN users u ON u.id = f.follower_id " +
  "WHERE f.following_id = ? " +
  "ORDER BY f.created_at DESC, u.id DESC LIMIT ? OFFSET ?";

const FOLLOWING_SQL =
  "SELECT u.id AS id, u.address AS address, u.x_name AS x_name, u.x_handle AS x_handle, " +
  "(SELECT COUNT(*) FROM follows c WHERE c.following_id = u.id) AS followers " +
  "FROM follows f JOIN users u ON u.id = f.following_id " +
  "WHERE f.follower_id = ? " +
  "ORDER BY f.created_at DESC, u.id DESC LIMIT ? OFFSET ?";

function totalFor(db: Db, userId: number, kind: FollowKind): number {
  const row = db
    .prepare(
      kind === "followers"
        ? "SELECT COUNT(*) AS n FROM follows WHERE following_id = ?"
        : "SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?",
    )
    .get(userId) as { n?: number } | undefined;
  return row?.n ?? 0;
}

/**
 * 某个用户的粉丝 / 关注列表：按关注时间倒序，带 TA 的粉丝数和当前访问者的关注状态。
 * viewerId 为 null（未登录）时 isFollowing 统一为 false。
 */
export function readFollowList(
  db: Db,
  user: ProfileUser,
  kind: FollowKind,
  viewerId: number | null = null,
  limit = 50,
  offset = 0,
): FollowList {
  const rows = db
    .prepare(kind === "followers" ? FOLLOWERS_SQL : FOLLOWING_SQL)
    .all(user.id, limit, offset) as unknown as FollowRow[];

  const followed = viewerId === null ? null : new Set(followingIds(db, viewerId));

  const items: FollowEntry[] = rows.map((row) => ({
    handle: row.x_handle ?? row.address,
    name: displayName({
      address: row.address,
      x_name: row.x_name,
      x_handle: row.x_handle,
    }),
    avatar: gradientFor(row.address),
    address: row.address,
    followers: row.followers,
    isFollowing: followed ? followed.has(row.id) : false,
    isSelf: viewerId !== null && viewerId === row.id,
  }));

  return { total: totalFor(db, user.id, kind), items };
}
