import { Router } from "express"
import { mockAuth } from "../middlewares/mockAuth.js" 
import { createEvent, getNearbyEvents, joinEvent, getEventById, leaveEvent } from "../controllers/event.controller.js"

import { getMyEvents } from "../controllers/event.controller.js"


const router = Router()

router.get("/nearby", getNearbyEvents)
router.get("/:id", getEventById)
router.post("/", mockAuth, createEvent)
router.post("/:id/join", mockAuth, joinEvent)
router.post("/:id/leave", mockAuth, leaveEvent)
router.get("/user/:userId", getMyEvents) 


export default router