export const createIdentityVerificationTableQuery = `
CREATE TABLE IF NOT EXISTS identity_verification_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birthday DATE NOT NULL,
  document_type TEXT,
  document_number TEXT,
  document_image_base64 TEXT,
  document_image_url TEXT,
  aadhaar_number TEXT,
  aadhaar_image_base64 TEXT,
  aadhaar_image_url TEXT,
  selfie_image_base64 TEXT,
  selfie_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export const identityVerificationColumnSyncQueries = [
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS document_type TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS document_number TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS document_image_base64 TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS document_image_url TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS aadhaar_image_url TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS selfie_image_url TEXT;`,
];

export const insertIdentityVerificationRequestQuery = `
INSERT INTO identity_verification_requests (
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at;
`;

export const getLatestIdentityVerificationByUserQuery = `
SELECT
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
FROM identity_verification_requests
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 1;
`;

export const getAnyIdentityVerificationByUserQuery = `
SELECT
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
FROM identity_verification_requests
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 1;
`;

export const updateIdentityVerificationRequestByIdQuery = `
UPDATE identity_verification_requests
SET
  first_name = $2,
  last_name = $3,
  birthday = $4,
  document_type = $5,
  document_number = $6,
  document_image_base64 = $7,
  document_image_url = $8,
  aadhaar_number = $6,
  aadhaar_image_base64 = $9,
  aadhaar_image_url = $10,
  selfie_image_base64 = $11,
  selfie_image_url = $12,
  status = 'pending',
  admin_note = NULL,
  reviewed_by = NULL,
  reviewed_at = NULL,
  updated_at = NOW()
WHERE id = $1
RETURNING
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at;
`;

export const deleteIdentityVerificationRequestsByUserQuery = `
DELETE FROM identity_verification_requests
WHERE user_id = $1
RETURNING id;
`;

export const getIdentityVerificationRequestsQuery = `
SELECT
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
FROM identity_verification_requests
WHERE ($1::TEXT IS NULL OR status = $1)
ORDER BY created_at DESC
LIMIT 200;
`;

export const reviewIdentityVerificationRequestQuery = `
UPDATE identity_verification_requests
SET
  status = $2,
  admin_note = $3,
  reviewed_by = $4,
  reviewed_at = NOW(),
  updated_at = NOW()
WHERE id = $1
RETURNING
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  document_image_url,
  aadhaar_number,
  aadhaar_image_base64,
  aadhaar_image_url,
  selfie_image_base64,
  selfie_image_url,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at;
`;
