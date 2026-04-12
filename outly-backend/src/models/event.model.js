export const createEventQuery = `
INSERT INTO events (title, description, location, creator_id, max_participants, event_date_time, expires_at)
VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6,$7,$8)
RETURNING *;
`

export const getNearbyEventsQuery = `
SELECT 
e.id, e.title, e.description, e.creator_id, e.created_at, e.updated_at,
e.max_participants, e.event_date_time, e.expires_at, e.is_active,
u.first_name AS creator_first_name,
u.last_name AS creator_last_name,
u.email AS creator_email,
u.profile_image_url AS creator_profile_image_url,
u.is_verified AS creator_is_verified,
ST_X(e.location::geometry) AS longitude,
ST_Y(e.location::geometry) AS latitude,
COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN ep.user_id END) AS participant_count,
COUNT(CASE WHEN ep.status = 'pending' THEN ep.user_id END) AS pending_count,
(
  e.max_participants IS NOT NULL
  AND COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN ep.user_id END) >= e.max_participants
) AS is_full,
(
  COALESCE(e.expires_at, e.event_date_time) IS NOT NULL
  AND COALESCE(e.expires_at, e.event_date_time) <= NOW()
) AS is_expired,
ST_Distance(
  e.location::geography,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
) AS distance_meters
FROM events e
LEFT JOIN event_participants ep
ON e.id = ep.event_id
LEFT JOIN users u
ON u.id = e.creator_id
WHERE ST_Distance(
    e.location::geography,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
) <= $3
AND (
  COALESCE(e.expires_at, e.event_date_time) IS NULL
  OR COALESCE(e.expires_at, e.event_date_time) > NOW()
)
AND COALESCE(e.is_active, TRUE) = TRUE
GROUP BY e.id, u.id
ORDER BY distance_meters
`

export const upsertParticipationRequestQuery = `
WITH updated AS (
  UPDATE event_participants
  SET status = 'pending', created_at = NOW()
  WHERE user_id = $1 AND event_id = $2
  RETURNING *
),
inserted AS (
  INSERT INTO event_participants (user_id, event_id, status)
  SELECT $1, $2, 'pending'
  WHERE NOT EXISTS (SELECT 1 FROM updated)
  RETURNING *
)
SELECT * FROM inserted
UNION ALL
SELECT * FROM updated
LIMIT 1;
`

export const getEventByIdQuery = `
SELECT 
e.id, e.title, e.description, e.creator_id, e.created_at, e.updated_at,
e.max_participants, e.event_date_time, e.expires_at, e.is_active,
u.first_name AS creator_first_name,
u.last_name AS creator_last_name,
u.email AS creator_email,
u.profile_image_url AS creator_profile_image_url,
u.is_verified AS creator_is_verified,
ST_X(e.location::geometry) AS longitude,
ST_Y(e.location::geometry) AS latitude,
COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN ep.user_id END) AS participant_count,
COUNT(CASE WHEN ep.status = 'pending' THEN ep.user_id END) AS pending_count,
(
  e.max_participants IS NOT NULL
  AND COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN ep.user_id END) >= e.max_participants
) AS is_full,
(
  COALESCE(e.expires_at, e.event_date_time) IS NOT NULL
  AND COALESCE(e.expires_at, e.event_date_time) <= NOW()
) AS is_expired,
(SELECT ep2.status
 FROM event_participants ep2
 WHERE ep2.event_id = e.id AND ep2.user_id = $2
 LIMIT 1) AS current_user_status,
(SELECT COALESCE(json_agg(json_build_object(
  'userId', u2.id,
  'firstName', u2.first_name,
  'lastName', u2.last_name,
  'profileImageUrl', u2.profile_image_url,
  'isVerified', u2.is_verified,
  'status', ep3.status
)), '[]'::json)
 FROM event_participants ep3
 JOIN users u2 ON u2.id = ep3.user_id
 WHERE ep3.event_id = e.id AND (ep3.status = 'accepted' OR ep3.status IS NULL)
) AS accepted_participants,
(SELECT COALESCE(json_agg(json_build_object(
  'userId', u3.id,
  'firstName', u3.first_name,
  'lastName', u3.last_name,
  'profileImageUrl', u3.profile_image_url,
  'isVerified', u3.is_verified,
  'status', ep4.status
)), '[]'::json)
 FROM event_participants ep4
 JOIN users u3 ON u3.id = ep4.user_id
 WHERE ep4.event_id = e.id AND ep4.status = 'pending'
) AS pending_participants,
(SELECT COALESCE(json_agg(json_build_object(
  'userId', u4.id,
  'firstName', u4.first_name,
  'lastName', u4.last_name,
  'profileImageUrl', u4.profile_image_url,
  'isVerified', u4.is_verified,
  'status', ep5.status
)), '[]'::json)
 FROM event_participants ep5
 JOIN users u4 ON u4.id = ep5.user_id
 WHERE ep5.event_id = e.id AND ep5.status = 'rejected'
) AS rejected_participants
FROM events e
LEFT JOIN event_participants ep
ON e.id = ep.event_id
LEFT JOIN users u
ON u.id = e.creator_id
WHERE e.id = $1
AND COALESCE(e.is_active, TRUE) = TRUE
AND (
  COALESCE(e.expires_at, e.event_date_time) IS NULL
  OR COALESCE(e.expires_at, e.event_date_time) > NOW()
)
GROUP BY e.id, u.id
`

export const leaveEventQuery = `
DELETE FROM event_participants
WHERE user_id = $1 AND event_id = $2
RETURNING event_id;
`

export const getMyEventsQuery = `
SELECT 
  e.*,
  ST_X(e.location::geometry) AS longitude,
  ST_Y(e.location::geometry) AS latitude,
  COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN ep.user_id END) AS participant_count,
  mep.status AS my_status,
  (
    COALESCE(e.expires_at, e.event_date_time) IS NOT NULL
    AND COALESCE(e.expires_at, e.event_date_time) <= NOW()
  ) AS is_expired,
  (
    e.max_participants IS NOT NULL
    AND COUNT(CASE WHEN ep.status = 'accepted' OR ep.status IS NULL THEN ep.user_id END) >= e.max_participants
  ) AS is_full
FROM events e
LEFT JOIN event_participants ep ON e.id = ep.event_id
LEFT JOIN event_participants mep ON mep.event_id = e.id AND mep.user_id = $1
WHERE (
  e.creator_id = $1
  OR e.id IN (
    SELECT event_id FROM event_participants WHERE user_id = $1
  )
)
AND COALESCE(e.is_active, TRUE) = TRUE
AND (
  COALESCE(e.expires_at, e.event_date_time) IS NULL
  OR COALESCE(e.expires_at, e.event_date_time) > NOW()
)
GROUP BY e.id, mep.status
ORDER BY e.created_at DESC;
`

export const getEventByIdForActionQuery = `
SELECT
  id,
  creator_id,
  is_active,
  max_participants,
  COALESCE(expires_at, event_date_time) AS live_until
FROM events
WHERE id = $1
LIMIT 1;
`;

export const countAcceptedParticipantsQuery = `
SELECT COUNT(*)::INT AS accepted_count
FROM event_participants
WHERE event_id = $1
AND (status = 'accepted' OR status IS NULL);
`;

export const getEventPendingParticipantsQuery = `
SELECT
  ep.user_id,
  ep.status,
  ep.created_at,
  u.first_name,
  u.last_name,
  u.profile_image_url,
  u.is_verified,
  u.age,
  u.hobbies,
  u.interests,
  u.bio
FROM event_participants ep
JOIN users u ON u.id = ep.user_id
WHERE ep.event_id = $1 AND ep.status = 'pending'
ORDER BY ep.created_at DESC;
`;

export const updateParticipantStatusQuery = `
UPDATE event_participants
SET status = $3
WHERE event_id = $1 AND user_id = $2
RETURNING *;
`;

export const getParticipantStatusQuery = `
SELECT status
FROM event_participants
WHERE event_id = $1 AND user_id = $2
LIMIT 1;
`;

export const deactivateExpiredEventsQuery = `
UPDATE events
SET is_active = FALSE
WHERE COALESCE(expires_at, event_date_time) <= NOW()
AND COALESCE(is_active, TRUE) = TRUE;
`;

export const markEventCompletedByCreatorQuery = `
UPDATE events
SET is_active = FALSE,
    expires_at = NOW(),
    updated_at = NOW()
WHERE id = $1 AND creator_id = $2
RETURNING id, is_active, expires_at, updated_at;
`;

export const deleteEventParticipantsByEventIdQuery = `
DELETE FROM event_participants
WHERE event_id = $1;
`;

export const deleteEventMessagesByEventIdQuery = `
DELETE FROM messages
WHERE event_id = $1;
`;

export const deleteEventByCreatorQuery = `
DELETE FROM events
WHERE id = $1 AND creator_id = $2
RETURNING id;
`;