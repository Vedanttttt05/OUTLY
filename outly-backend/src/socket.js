import { Server } from "socket.io"
import { clerkClient } from "@clerk/express"
import pool from "./db/connection.js"

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) return next(new Error("No token provided"))
      const payload = await clerkClient.verifyToken(token)
      socket.userId = payload.sub
      next()
    } catch (err) {
      next(new Error("Unauthorized"))
    }
  })

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userId}`)

    socket.on("join_event", async (eventId) => {
      socket.join(`event:${eventId}`)

      // Send last 50 messages on join
      const result = await pool.query(
        `SELECT * FROM messages 
         WHERE event_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [eventId]
      )

      socket.emit("message_history", result.rows.reverse())
    })

    socket.on("send_message", async ({ eventId, message }) => {
      if (!eventId || !message?.trim()) return

      // Save to DB
      const result = await pool.query(
        `INSERT INTO messages (event_id, user_id, content)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [eventId, socket.userId, message.trim()]
      )

      const saved = result.rows[0]

      // Broadcast to room
      io.to(`event:${eventId}`).emit("new_message", saved)
    })

    socket.on("leave_event", (eventId) => {
      socket.leave(`event:${eventId}`)
    })

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userId}`)
    })
  })

  return io
}