import express from "express"
import { createEvent, getNearbyEvents , joinEvent  , getEventById , leaveEvent} from "../controllers/event.controller.js"

const router = express.Router()

router.post("/", createEvent)

router.get("/nearby", getNearbyEvents)
router.post("/:id/join", joinEvent)
router.get("/:id", getEventById)
router.delete("/:id/leave", leaveEvent)

export default router