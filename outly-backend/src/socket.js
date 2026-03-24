import { Server } from "socket.io"
import pool from "./db/connection.js"

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  })

  // Remove the io.use() auth block entirely for now

  io.on("connection", (socket) => {
    socket.userId = "test_user_123" // hardcode like mockAuth
    console.log(`User connected: ${socket.userId}`)

    socket.on("join_event", async (eventId) => {
      socket.join(`event:${eventId}`)

      const result = await pool.query(
        `SELECT * FROM messages WHERE event_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [eventId]
      )
      socket.emit("message_history", result.rows.reverse())
    })

    socket.on("send_message", async ({ eventId, message }) => {
      if (!eventId || !message?.trim()) return

      const result = await pool.query(
        `INSERT INTO messages (event_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
        [eventId, socket.userId, message.trim()]
      )

      io.to(`event:${eventId}`).emit("new_message", result.rows[0])
    })

    socket.on("leave_event", (eventId) => socket.leave(`event:${eventId}`))

    socket.on("disconnect", () => console.log(`User disconnected: ${socket.userId}`))
  })

  return io
}