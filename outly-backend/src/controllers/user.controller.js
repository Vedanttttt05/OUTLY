import pool from '../db/connection.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { normalizeImageReference } from '../utils/cloudinary.js';

const formatDateOnly = (date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseBirthday = (value) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('Birthday must be a valid date', '', [], 400);
  }

  const now = new Date();
  if (date > now) {
    throw new ApiError('Birthday cannot be in the future', '', [], 400);
  }

  return formatDateOnly(date);
};

const normalizeBirthdayOutput = (value) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isoDateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);

    if (isoDateMatch) {
      return isoDateMatch[1];
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateOnly(parsed);
    }
  }

  return null;
};

const calculateAgeFromBirthday = (birthdayValue) => {
  if (!birthdayValue) return null;

  const birthday = new Date(birthdayValue);
  if (Number.isNaN(birthday.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const monthDiff = today.getMonth() - birthday.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const parseStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const ensureCurrentUser = async (req) => {
  const auth = req.auth();
  const userId = auth?.userId;
  if (!userId) {
    throw new ApiError('Unauthorized', '', [], 401);
  }

  const claims = auth?.sessionClaims || {};
  const email = claims.email || claims.email_address || null;
  const firstName = claims.first_name || null;
  const lastName = claims.last_name || null;

  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name)
     VALUES ($1, COALESCE($2, $1 || '@unknown.local'), $3, $4)
     ON CONFLICT (id) DO UPDATE
     SET email = COALESCE(EXCLUDED.email, users.email),
         first_name = COALESCE(EXCLUDED.first_name, users.first_name),
         last_name = COALESCE(EXCLUDED.last_name, users.last_name),
         updated_at = NOW()`,
    [userId, email, firstName, lastName]
  );

  return userId;
};

const isBlockedBetween = async (userA, userB) => {
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

const serializeUser = (row) => {
  const normalizedBirthday = normalizeBirthdayOutput(row.birthday);
  const derivedAge = calculateAgeFromBirthday(normalizedBirthday);

  return {
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  birthday: normalizedBirthday,
  profileImageUrl: row.profile_image_url,
  isVerified: row.is_verified,
  age: derivedAge ?? row.age,
  hobbies: row.hobbies || [],
  interests: row.interests || [],
  bio: row.bio,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  };
};

const getCreatedEventsLive = async (userId) => {
  const result = await pool.query(
    `SELECT
       e.id,
       e.title,
       e.description,
       e.creator_id,
       e.max_participants,
       e.event_date_time,
       e.expires_at,
       e.created_at,
       ST_X(e.location::geometry) AS longitude,
       ST_Y(e.location::geometry) AS latitude,
       COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN 1 END) AS participant_count
     FROM events e
     LEFT JOIN event_participants ep ON ep.event_id = e.id
     WHERE e.creator_id = $1
       AND COALESCE(e.is_active, TRUE) = TRUE
       AND (
         COALESCE(e.expires_at, e.event_date_time) IS NULL
         OR COALESCE(e.expires_at, e.event_date_time) > NOW()
       )
     GROUP BY e.id
     ORDER BY e.created_at DESC`,
    [userId]
  );

  return result.rows;
};

const getCreatedEventsPast = async (userId) => {
  const result = await pool.query(
    `SELECT
       e.id,
       e.title,
       e.description,
       e.creator_id,
       e.max_participants,
       e.event_date_time,
       e.expires_at,
       e.created_at,
       ST_X(e.location::geometry) AS longitude,
       ST_Y(e.location::geometry) AS latitude,
       GREATEST(
         FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(e.expires_at, e.event_date_time, e.created_at))) / 86400),
         0
       )::INT AS days_ago,
       COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN 1 END) AS participant_count
     FROM events e
     LEFT JOIN event_participants ep ON ep.event_id = e.id
     WHERE e.creator_id = $1
       AND (
         COALESCE(e.is_active, TRUE) = FALSE
         OR (
           COALESCE(e.expires_at, e.event_date_time) IS NOT NULL
           AND COALESCE(e.expires_at, e.event_date_time) <= NOW()
         )
       )
     GROUP BY e.id
     ORDER BY COALESCE(e.expires_at, e.event_date_time, e.created_at) DESC`,
    [userId]
  );

  return result.rows;
};

const getJoinedEventsLive = async (userId) => {
  const result = await pool.query(
    `SELECT
       e.id,
       e.title,
       e.description,
       e.creator_id,
       e.max_participants,
       e.event_date_time,
       e.expires_at,
       e.created_at,
       ST_X(e.location::geometry) AS longitude,
       ST_Y(e.location::geometry) AS latitude,
       ep.status AS my_status,
       COUNT(CASE WHEN ep2.status = 'accepted' OR ep2.status IS NULL THEN 1 END) AS participant_count
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     LEFT JOIN event_participants ep2 ON ep2.event_id = e.id
     WHERE ep.user_id = $1
       AND COALESCE(e.is_active, TRUE) = TRUE
       AND (
         COALESCE(e.expires_at, e.event_date_time) IS NULL
         OR COALESCE(e.expires_at, e.event_date_time) > NOW()
       )
     GROUP BY e.id, ep.status
     ORDER BY e.created_at DESC`,
    [userId]
  );

  return result.rows;
};

const getJoinedEventsPast = async (userId) => {
  const result = await pool.query(
    `SELECT
       e.id,
       e.title,
       e.description,
       e.creator_id,
       e.max_participants,
       e.event_date_time,
       e.expires_at,
       e.created_at,
       ST_X(e.location::geometry) AS longitude,
       ST_Y(e.location::geometry) AS latitude,
       ep.status AS my_status,
       GREATEST(
         FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(e.expires_at, e.event_date_time, e.created_at))) / 86400),
         0
       )::INT AS days_ago,
       COUNT(CASE WHEN ep2.status = 'accepted' OR ep2.status IS NULL THEN 1 END) AS participant_count
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     LEFT JOIN event_participants ep2 ON ep2.event_id = e.id
     WHERE ep.user_id = $1
       AND (
         COALESCE(e.is_active, TRUE) = FALSE
         OR (
           COALESCE(e.expires_at, e.event_date_time) IS NOT NULL
           AND COALESCE(e.expires_at, e.event_date_time) <= NOW()
         )
       )
     GROUP BY e.id, ep.status
     ORDER BY COALESCE(e.expires_at, e.event_date_time, e.created_at) DESC`,
    [userId]
  );

  return result.rows;
};

export const getMyProfile = asyncHandler(async (req, res) => {
  const userId = await ensureCurrentUser(req);

  const userResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!userResult.rows.length) {
    throw new ApiError('User profile not found', '', [], 404);
  }

  const [createdLiveEvents, createdPastEvents, joinedLiveEvents, joinedPastEvents] = await Promise.all([
    getCreatedEventsLive(userId),
    getCreatedEventsPast(userId),
    getJoinedEventsLive(userId),
    getJoinedEventsPast(userId),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Profile fetched', {
      ...serializeUser(userResult.rows[0]),
      eventsCreated: createdLiveEvents,
      eventsCreatedLive: createdLiveEvents,
      eventsCreatedPast: createdPastEvents,
      eventsJoined: joinedLiveEvents,
      eventsJoinedLive: joinedLiveEvents,
      eventsJoinedPast: joinedPastEvents,
    })
  );
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const userId = await ensureCurrentUser(req);

  const {
    firstName,
    lastName,
    birthday,
    age,
    hobbies,
    interests,
    bio,
    profileImage,
    profileImageUrl,
  } = req.body;

  const normalizedBirthday = parseBirthday(birthday);
  const derivedAge = calculateAgeFromBirthday(normalizedBirthday);

  const fallbackAge = age === null || age === undefined || age === '' ? null : Number(age);
  if (fallbackAge !== null && (!Number.isFinite(fallbackAge) || fallbackAge < 1 || fallbackAge > 120)) {
    throw new ApiError('Age must be between 1 and 120', '', [], 400);
  }

  const parsedAge = derivedAge ?? fallbackAge;

  const normalizedImage = await normalizeImageReference({
    image: profileImage || profileImageUrl,
    folder: 'outly/profiles',
    publicIdPrefix: userId,
  });

  const hobbiesArray = parseStringArray(hobbies);
  const interestsArray = parseStringArray(interests);

  const result = await pool.query(
    `UPDATE users
     SET first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name),
         birthday = COALESCE($4, birthday),
         age = COALESCE($5, age),
         hobbies = $6,
         interests = $7,
         bio = $8,
         profile_image_url = COALESCE($9, profile_image_url),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      userId,
      firstName ? String(firstName).trim() : null,
      lastName ? String(lastName).trim() : null,
      normalizedBirthday,
      parsedAge,
      hobbiesArray,
      interestsArray,
      bio ? String(bio).trim() : null,
      normalizedImage,
    ]
  );

  return res.status(200).json(new ApiResponse(200, 'Profile updated', serializeUser(result.rows[0])));
});

export const getUserProfileById = asyncHandler(async (req, res) => {
  const viewerId = await ensureCurrentUser(req);
  const targetUserId = String(req.params.id || '').trim();

  if (!targetUserId) {
    throw new ApiError('User id is required', '', [], 400);
  }

  if (viewerId !== targetUserId) {
    const blocked = await isBlockedBetween(viewerId, targetUserId);
    if (blocked) {
      throw new ApiError('User profile unavailable', '', [], 403);
    }
  }

  const userResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [targetUserId]);
  if (!userResult.rows.length) {
    throw new ApiError('User not found', '', [], 404);
  }

  const [createdLiveEvents, createdPastEvents, joinedLiveEvents, joinedPastEvents] = await Promise.all([
    getCreatedEventsLive(targetUserId),
    getCreatedEventsPast(targetUserId),
    getJoinedEventsLive(targetUserId),
    getJoinedEventsPast(targetUserId),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'User profile fetched', {
      ...serializeUser(userResult.rows[0]),
      eventsCreated: createdLiveEvents,
      eventsCreatedLive: createdLiveEvents,
      eventsCreatedPast: createdPastEvents,
      eventsJoined: joinedLiveEvents,
      eventsJoinedLive: joinedLiveEvents,
      eventsJoinedPast: joinedPastEvents,
    })
  );
});

export const blockUser = asyncHandler(async (req, res) => {
  const userId = await ensureCurrentUser(req);
  const targetUserId = String(req.params.id || '').trim();

  if (!targetUserId || targetUserId === userId) {
    throw new ApiError('Invalid user id to block', '', [], 400);
  }

  await pool.query(
    `INSERT INTO blocked_users (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [userId, targetUserId]
  );

  return res.status(200).json(new ApiResponse(200, 'User blocked'));
});

export const unblockUser = asyncHandler(async (req, res) => {
  const userId = await ensureCurrentUser(req);
  const targetUserId = String(req.params.id || '').trim();

  if (!targetUserId || targetUserId === userId) {
    throw new ApiError('Invalid user id to unblock', '', [], 400);
  }

  await pool.query(
    `DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
    [userId, targetUserId]
  );

  return res.status(200).json(new ApiResponse(200, 'User unblocked'));
});

export const getMyBlockedUsers = asyncHandler(async (req, res) => {
  const userId = await ensureCurrentUser(req);

  const result = await pool.query(
    `SELECT
       bu.blocked_id AS id,
       u.first_name,
       u.last_name,
       u.email,
       u.profile_image_url,
       bu.created_at
     FROM blocked_users bu
     LEFT JOIN users u ON u.id = bu.blocked_id
     WHERE bu.blocker_id = $1
     ORDER BY bu.created_at DESC`,
    [userId]
  );

  const blockedUsers = result.rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    profileImageUrl: row.profile_image_url,
    blockedAt: row.created_at,
  }));

  return res.status(200).json(new ApiResponse(200, 'Blocked users fetched', blockedUsers));
});

export const reportUser = asyncHandler(async (req, res) => {
  const reporterId = await ensureCurrentUser(req);
  const reportedUserId = String(req.params.id || '').trim();
  const reason = String(req.body.reason || '').trim();
  const description = String(req.body.description || '').trim();

  if (!reportedUserId || reportedUserId === reporterId) {
    throw new ApiError('Invalid reported user id', '', [], 400);
  }

  if (!reason) {
    throw new ApiError('Report reason is required', '', [], 400);
  }

  const result = await pool.query(
    `INSERT INTO reports (reporter_id, reported_user_id, reason, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, reporter_id, reported_user_id, reason, description, created_at`,
    [reporterId, reportedUserId, reason, description || null]
  );

  return res.status(201).json(new ApiResponse(201, 'User reported', result.rows[0]));
});

export const getUserEventsById = asyncHandler(async (req, res) => {
  const viewerId = await ensureCurrentUser(req);
  const targetUserId = String(req.params.id || '').trim();

  if (!targetUserId) {
    throw new ApiError('User id is required', '', [], 400);
  }

  if (viewerId !== targetUserId) {
    const blocked = await isBlockedBetween(viewerId, targetUserId);
    if (blocked) {
      throw new ApiError('User events unavailable', '', [], 403);
    }
  }

  const [createdLiveEvents, createdPastEvents, joinedLiveEvents, joinedPastEvents] = await Promise.all([
    getCreatedEventsLive(targetUserId),
    getCreatedEventsPast(targetUserId),
    getJoinedEventsLive(targetUserId),
    getJoinedEventsPast(targetUserId),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'User events fetched', {
      created: createdLiveEvents,
      createdLive: createdLiveEvents,
      createdPast: createdPastEvents,
      joined: joinedLiveEvents,
      joinedLive: joinedLiveEvents,
      joinedPast: joinedPastEvents,
    })
  );
});
