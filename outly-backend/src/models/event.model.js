export const createEventQuery = `
INSERT INTO events (title, description, location, created_by)
VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5)
RETURNING *;
`

export const getNearbyEventsQuery = `
SELECT 
e.*,
COUNT(ep.user_id) AS participants,
ST_Distance(
    e.location,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
) AS distance
FROM events e
LEFT JOIN event_participants ep
ON e.id = ep.event_id
WHERE ST_DWithin(
    e.location,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
    5000
)
GROUP BY e.id
ORDER BY distance
`

export const joinEventQuery = `
INSERT INTO event_participants (user_id, event_id)
VALUES ($1,$2)
ON CONFLICT (user_id,event_id) DO NOTHING
RETURNING *;
`

export const getEventByIdQuery = `
SELECT 
e.*,
COUNT(ep.user_id) AS participants
FROM events e
LEFT JOIN event_participants ep
ON e.id = ep.event_id
WHERE e.id = $1
GROUP BY e.id
`