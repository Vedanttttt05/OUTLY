import { Server } from "socket.io"
import pool from "./db/connection.js"
import { isBlockedBetweenUsers } from "./utils/safety.js"

const CHAT_AUTH_TTL_MS = 10 * 60 * 1000

const isEventExpired = (eventRow) => {
  if (!eventRow) return true
  if (eventRow.is_active === false) return true
  if (!eventRow.live_until) return false
  return new Date(eventRow.live_until).getTime() <= Date.now()
}

const getEventState = async (eventId) => {
  const result = await pool.query(
    `SELECT id, creator_id, is_active,
            COALESCE(expires_at, event_date_time) AS live_until
     FROM events
     WHERE id = $1
     LIMIT 1`,
    [eventId]
  )

  return result.rows[0] || null
}

const isUserAcceptedForEvent = async (eventId, userId) => {
  const result = await pool.query(
    `SELECT status
     FROM event_participants
     WHERE event_id = $1 AND user_id = $2
     LIMIT 1`,
    [eventId, userId]
  )

  const status = result.rows[0]?.status
  return status === 'accepted' || status === null
}

const hasBlockConflictWithAcceptedMembers = async (eventId, userId) => {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM event_participants ep
       JOIN blocked_users bu
         ON (
              (bu.blocker_id = $2 AND bu.blocked_id = ep.user_id)
           OR (bu.blocker_id = ep.user_id AND bu.blocked_id = $2)
         )
       WHERE ep.event_id = $1
         AND ep.user_id <> $2
         AND (ep.status = 'accepted' OR ep.status IS NULL)
     ) AS has_conflict`,
    [eventId, userId]
  )

  return Boolean(result.rows[0]?.has_conflict)
}

const looksLikeUserId = (value) => {
  return typeof value === 'string' && /^user_[A-Za-z0-9]+$/.test(value.trim())
}

const resolveSenderName = ({ dbFirstName, dbLastName, dbEmail, clientName }) => {
  const dbFullName = [dbFirstName, dbLastName].filter(Boolean).join(" ").trim()
  const cleanedClientName = typeof clientName === 'string' ? clientName.trim() : ''
  const emailPrefix = typeof dbEmail === 'string' && dbEmail.includes('@')
    ? dbEmail.split('@')[0].trim()
    : ''

  const options = [dbFullName, cleanedClientName, emailPrefix]
  const selected = options.find((name) => name && !looksLikeUserId(name) && name.toLowerCase() !== 'user')

  return selected || 'User'
}

const getSenderMeta = async (userId, clientName = null, clientProfileImage = null) => {
  const senderResult = await pool.query(
    `SELECT id, first_name, last_name, email, profile_image_url, is_verified
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  )

  const sender = senderResult.rows[0] || {
    first_name: null,
    last_name: null,
    email: null,
    profile_image_url: null,
    is_verified: false,
  }

  return {
    name: resolveSenderName({
      dbFirstName: sender.first_name,
      dbLastName: sender.last_name,
      dbEmail: sender.email,
      clientName,
    }),
    profileImage: sender.profile_image_url || (typeof clientProfileImage === 'string' ? clientProfileImage.trim() : '') || null,
    isVerified: Boolean(sender.is_verified),
  }
}

const isSocketAuthorizedForEvent = (socket, eventId, userId) => {
  const authorizedAt = Number(socket?.chatAuthorizedAt || 0)
  if (!authorizedAt) return false

  return (
    socket?.userId === userId
    && String(socket?.eventId || '') === String(eventId)
    && Date.now() - authorizedAt <= CHAT_AUTH_TTL_MS
  )
}

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  })

  io.on("connection", (socket) => {
    console.log("User connected")

    // Join event
    socket.on("join_event", async ({ eventId, userId, includeHistory = true }) => {
      if (!eventId || !userId) return

      const event = await getEventState(eventId)
      if (!event) {
        socket.emit("chat_error", { message: "Event not found" })
        return
      }

      if (isEventExpired(event)) {
        socket.emit("chat_error", { message: "Event has expired. Chat is disabled." })
        return
      }

      const blockedWithCreator = await isBlockedBetweenUsers(userId, event.creator_id)
      if (blockedWithCreator) {
        socket.emit("chat_error", { message: "Chat unavailable due to user safety restrictions." })
        return
      }

      const hasBlockConflict = await hasBlockConflictWithAcceptedMembers(eventId, userId)
      if (hasBlockConflict) {
        socket.emit("chat_error", { message: "Chat unavailable due to block settings." })
        return
      }

      const isCreator = event.creator_id === userId
      const accepted = isCreator ? true : await isUserAcceptedForEvent(eventId, userId)
      if (!accepted) {
        socket.emit("chat_error", { message: "Only accepted participants can access chat." })
        return
      }

      socket.userId = userId
      socket.eventId = String(eventId)
      socket.chatAuthorizedAt = Date.now()
      socket.senderMeta = await getSenderMeta(userId)
      socket.join(`event:${eventId}`)

      console.log(`User ${userId} joined event ${eventId}`)

      if (includeHistory === false) {
        return
      }

      const result = await pool.query(
        `SELECT
           m.id,
           m.event_id,
           m.sender_id,
           m.sender_id AS user_id,
           m.content,
           CASE
             WHEN m.sender_name IS NULL OR btrim(lower(m.sender_name)) IN ('', 'user')
               THEN COALESCE(
                 NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
                 NULLIF(split_part(u.email, '@', 1), ''),
                 'User'
               )
             ELSE m.sender_name
           END AS sender_name,
           COALESCE(m.sender_profile_image, u.profile_image_url) AS sender_profile_image,
           COALESCE(m.sender_verified, u.is_verified, FALSE) AS sender_verified,
           m.created_at
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.event_id = $1
         ORDER BY m.created_at DESC
         LIMIT 50`,
        [eventId]
      )

      socket.emit("message_history", result.rows.reverse())
    })


    // Send message
    socket.on("send_message", async ({ eventId, userId, message, senderName: clientSenderName, senderProfileImage: clientSenderProfileImage }) => {
      if (!eventId || !message?.trim() || !userId) return

      try {
        const isAuthorizedSocket = isSocketAuthorizedForEvent(socket, eventId, userId)

        if (!isAuthorizedSocket) {
          const event = await getEventState(eventId)
          if (!event || isEventExpired(event)) {
            socket.emit("chat_error", { message: "Event has expired. Chat is disabled." })
            return
          }

          const blockedWithCreator = await isBlockedBetweenUsers(userId, event.creator_id)
          if (blockedWithCreator) {
            socket.emit("chat_error", { message: "Message blocked due to safety restrictions." })
            return
          }

          const hasBlockConflict = await hasBlockConflictWithAcceptedMembers(eventId, userId)
          if (hasBlockConflict) {
            socket.emit("chat_error", { message: "Message blocked due to block settings." })
            return
          }

          const isCreator = event.creator_id === userId
          const accepted = isCreator ? true : await isUserAcceptedForEvent(eventId, userId)
          if (!accepted) {
            socket.emit("chat_error", { message: "Only accepted participants can send messages." })
            return
          }

          socket.userId = userId
          socket.eventId = String(eventId)
          socket.chatAuthorizedAt = Date.now()
        }

        if (!socket.senderMeta) {
          socket.senderMeta = await getSenderMeta(userId, clientSenderName, clientSenderProfileImage)
        }

        const senderName = socket.senderMeta.name
        const senderProfileImage = socket.senderMeta.profileImage
        const senderVerified = socket.senderMeta.isVerified

        const result = await pool.query(
          `INSERT INTO messages (event_id, sender_id, content, sender_name, sender_profile_image, sender_verified)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, event_id, sender_id, sender_id AS user_id, content, sender_name, sender_profile_image, sender_verified, created_at`,
          [eventId, userId, message.trim(), senderName, senderProfileImage, senderVerified]
        )

        io.to(`event:${eventId}`).emit("new_message", result.rows[0])

      } catch (error) {
        console.error("Message error:", error)
      }
    })


    // Leave event
    socket.on("leave_event", ({ eventId }) => {
      socket.leave(`event:${eventId}`)
    })


    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userId}`)
    })

  })

  return io
}