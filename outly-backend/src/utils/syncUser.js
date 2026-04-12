// utils/syncUser.js
import pool from "../db/connection.js";
import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const syncUserFromClerk = async (userId) => {
  const clerkUser = await clerk.users.getUser(userId);

  const email = clerkUser.emailAddresses?.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? null;

  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, profile_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
     SET
       first_name        = EXCLUDED.first_name,
       last_name         = EXCLUDED.last_name,
       email             = EXCLUDED.email,
       profile_image_url = EXCLUDED.profile_image_url,
       updated_at        = NOW()`,
    [
      clerkUser.id,
      email,
      clerkUser.firstName ?? null,
      clerkUser.lastName ?? null,
      clerkUser.imageUrl ?? null,
    ]
  );
};