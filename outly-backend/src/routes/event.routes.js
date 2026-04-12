import { Router } from "express"
import { requireAuth } from "@clerk/express"
import {
	createEvent,
	getNearbyEvents,
	joinEvent,
	getEventById,
	leaveEvent,
	getMyEvents,
	getInterestedUsers,
	reviewInterestedUser,
	markEventCompleted,
	deleteEvent,
} from "../controllers/event.controller.js"

const router = Router()

router.get("/nearby", getNearbyEvents)
router.get("/mine", requireAuth(), getMyEvents)  // ✅ before /:id
router.get("/:id/interested", requireAuth(), getInterestedUsers)
router.patch("/:id/participants/:participantId/review", requireAuth(), reviewInterestedUser)
router.patch("/:id/complete", requireAuth(), markEventCompleted)
router.delete("/:id", requireAuth(), deleteEvent)
router.get("/:id", getEventById)
router.post("/", requireAuth(), createEvent)
router.post("/:id/join", requireAuth(), joinEvent)
router.post("/:id/leave", requireAuth(), leaveEvent)

export default router