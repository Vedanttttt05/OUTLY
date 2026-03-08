export const createEventQuery = `
INSERT INTO events (title, description, location, created_by)
VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5)
RETURNING *;
`

export const getNearbyEventsQuery = `
SELECT *,
ST_Distance(
    location,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
) AS distance
FROM events
WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
    5000
)
ORDER BY distance
`