import { Router } from "express"
import { requireAuth } from "@clerk/express"
import { createEvent, getNearbyEvents, joinEvent, getEventById, leaveEvent, getMyEvents } from "../controllers/event.controller.js"

const router = Router()

router.get("/nearby", getNearbyEvents)
router.get("/mine", requireAuth(), getMyEvents)  // ✅ before /:id
router.get("/:id", getEventById)
router.post("/", requireAuth(), createEvent)
router.post("/:id/join", requireAuth(), joinEvent)
router.post("/:id/leave", requireAuth(), leaveEvent)

export default router