export const createEventQuery = `
INSERT INTO events (title, description, location, created_by, category)
VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6)
RETURNING *;
`

export const getNearbyEventsQuery = `
SELECT 
e.id, e.title, e.description, e.category, e.created_by,
e.starts_at, e.ends_at, e.is_private, e.venue_id, e.created_at,
ST_X(e.location::geometry) AS longitude,
ST_Y(e.location::geometry) AS latitude,
COUNT(ep.user_id) AS participant_count,
ST_Distance(
    e.location,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
) AS distance_meters
FROM events e
LEFT JOIN event_participants ep
ON e.id = ep.event_id
WHERE ST_DWithin(
    e.location,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
    5000
)
GROUP BY e.id
ORDER BY distance_meters
`

export const joinEventQuery = `
INSERT INTO event_participants (user_id, event_id)
VALUES ($1,$2)
ON CONFLICT (user_id,event_id) DO NOTHING
RETURNING *;
`

export const getEventByIdQuery = `
SELECT 
e.id, e.title, e.description, e.category, e.created_by,
e.starts_at, e.ends_at, e.is_private, e.venue_id, e.created_at,
ST_X(e.location::geometry) AS longitude,
ST_Y(e.location::geometry) AS latitude,
COUNT(ep.user_id) AS participant_count
FROM events e
LEFT JOIN event_participants ep
ON e.id = ep.event_id
WHERE e.id = $1
GROUP BY e.id
`

export const leaveEventQuery = `
DELETE FROM event_participants
WHERE user_id = $1 AND event_id = $2
RETURNING event_id;
`