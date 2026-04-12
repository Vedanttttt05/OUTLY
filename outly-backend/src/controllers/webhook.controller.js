import { Webhook } from "svix"
import pool from "../db/connection.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import ApiResponse from "../utils/apiResponse.js"
import ApiError from "../utils/apiError.js"

export const clerkWebhook = asyncHandler(async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) throw new ApiError("Webhook secret missing", "", [], 500)

  const headers = req.headers
  const payload = req.body.toString()

  const wh = new Webhook(WEBHOOK_SECRET)
  let event

  try {
    event = wh.verify(payload, {
      "svix-id": headers["svix-id"],
      "svix-timestamp": headers["svix-timestamp"],
      "svix-signature": headers["svix-signature"],
    })
  } catch (err) {
    throw new ApiError("Invalid webhook signature", "", [], 400)
  }

  const user = event.data

  switch (event.type) {
    case "user.created": {
      const userId = user.id
      const email = user.email_addresses?.[0]?.email_address
      const firstName = user.first_name || null
      const lastName = user.last_name || null
      const profileImageUrl = user.image_url || null

      if (!userId || !email) throw new ApiError("Invalid user data", "", [], 400)

      await pool.query(
        `INSERT INTO users (id, email, first_name, last_name, profile_image_url)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             profile_image_url = EXCLUDED.profile_image_url,
             updated_at = NOW()`,
        [userId, email, firstName, lastName, profileImageUrl]
      )
      break
    }

    case "user.updated": {
      const userId = user.id
      const email = user.email_addresses?.[0]?.email_address
      const firstName = user.first_name || null
      const lastName = user.last_name || null
      const profileImageUrl = user.image_url || null

      await pool.query(
        `UPDATE users
         SET email = $1,
             first_name = $2,
             last_name = $3,
             profile_image_url = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [email, firstName, lastName, profileImageUrl, userId]
      )
      break
    }

    case "user.deleted": {
      await pool.query(`DELETE FROM users WHERE id = $1`, [user.id])
      break
    }

    default:
      break
  }

  return res.json(new ApiResponse(200, "Webhook processed successfully"))
})