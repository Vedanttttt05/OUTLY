export const createVenueQuery = `
INSERT INTO venues (name, owner_id, location, category)
VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3,$4), 4326)::geography, $5)
RETURNING *;
`

export const getVenueByIdQuery = `
SELECT * FROM venues WHERE id = $1
`

export const getNearbyVenuesQuery = `
SELECT 
  v.*,
  ST_Distance(
    v.location,
    ST_SetSRID(ST_MakePoint($1,$2), 4326)::geography
  ) AS distance
FROM venues v
WHERE ST_DWithin(
    v.location,
    ST_SetSRID(ST_MakePoint($1,$2), 4326)::geography,
    5000
)
ORDER BY distance;
`

export const getMyVenuesQuery = `
SELECT * FROM venues WHERE owner_id = $1
`