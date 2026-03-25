import { Server } from "socket.io"
import pool from "./db/connection.js"

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*" }
  })

  io.on("connection", (socket) => {
    console.log("User connected")

    // Join event
    socket.on("join_event", async ({ eventId, userId }) => {
      if (!eventId || !userId) return

      socket.userId = userId
      socket.join(`event:${eventId}`)

      console.log(`User ${userId} joined event ${eventId}`)

      const result = await pool.query(
        `SELECT * 
         FROM messages 
         WHERE event_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [eventId]
      )

      socket.emit("message_history", result.rows.reverse())
    })


    // Send message
    socket.on("send_message", async ({ eventId, userId, message }) => {
      if (!eventId || !message?.trim() || !userId) return

      try {
        const result = await pool.query(
          `INSERT INTO messages (event_id, user_id, content) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [eventId, userId, message.trim()]
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