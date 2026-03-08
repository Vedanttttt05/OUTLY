import express from "express"
import { createEvent, getNearbyEvents , joinEvent } from "../controllers/event.controller.js"

const router = express.Router()

router.post("/", createEvent)

router.get("/nearby", getNearbyEvents)
router.post("/:id/join", joinEvent)

export default router