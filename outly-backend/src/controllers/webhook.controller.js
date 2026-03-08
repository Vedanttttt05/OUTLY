import pool from "../db/connection.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import ApiResponse from "../utils/apiResponse.js"
import ApiError from "../utils/apiError.js"

export const clerkWebhook = asyncHandler(async (req, res) => {

  const event = req.body

  if (!event || !event.type) {
    throw new ApiError("Invalid webhook payload", "", [], 400)
  }

  const user = event.data

  switch (event.type) {

    case "user.created": {

      const userId = user.id
      const email = user.email_addresses?.[0]?.email_address

      if (!userId || !email) {
        throw new ApiError("Invalid user data", "", [], 400)
      }

      await pool.query(
        `INSERT INTO users (id, email)
         VALUES ($1,$2)
         ON CONFLICT (id) DO NOTHING`,
        [userId, email]
      )

      break
    }

    case "user.updated": {

      const userId = user.id
      const email = user.email_addresses?.[0]?.email_address

      await pool.query(
        `UPDATE users
         SET email = $1
         WHERE id = $2`,
        [email, userId]
      )

      break
    }

    case "user.deleted": {

      const userId = user.id

      await pool.query(
        `DELETE FROM users
         WHERE id = $1`,
        [userId]
      )

      break
    }

    default:
      break
  }

  return res.json(
    new ApiResponse(200, "Webhook processed successfully")
  )
})