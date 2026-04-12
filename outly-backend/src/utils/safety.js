import pool from '../db/connection.js';

export const isBlockedBetweenUsers = async (userA, userB) => {
  if (!userA || !userB) return false;

  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM blocked_users
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
     ) AS is_blocked`,
    [userA, userB]
  );

  return Boolean(result.rows[0]?.is_blocked);
};
