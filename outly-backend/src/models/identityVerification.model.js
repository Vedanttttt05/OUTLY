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
  aadhaar_number TEXT NOT NULL,
  aadhaar_image_base64 TEXT NOT NULL,
  selfie_image_base64 TEXT NOT NULL,
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
  aadhaar_number,
  aadhaar_image_base64,
  selfie_image_base64
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING
  id,
  user_id,
  first_name,
  last_name,
  birthday,
  document_type,
  document_number,
  document_image_base64,
  aadhaar_number,
  aadhaar_image_base64,
  selfie_image_base64,
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
  aadhaar_number,
  aadhaar_image_base64,
  selfie_image_base64,
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
  aadhaar_number,
  aadhaar_image_base64,
  selfie_image_base64,
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
  aadhaar_number,
  aadhaar_image_base64,
  selfie_image_base64,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at;
`;
