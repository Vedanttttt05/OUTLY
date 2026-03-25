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

      if (!userId || !email) throw new ApiError("Invalid user data", "", [], 400)

      await pool.query(
        `INSERT INTO users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
        [userId, email]
      )
      break
    }

    case "user.updated": {
      const userId = user.id
      const email = user.email_addresses?.[0]?.email_address
      await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, userId])
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