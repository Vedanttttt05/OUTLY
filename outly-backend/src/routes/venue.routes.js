import { Router } from "express"
import { mockAuth } from "../middleware/mockAuth.js"
import { createVenue, getNearbyVenues, getVenueById, getMyVenues } from "../controllers/venue.controller.js"

const router = Router()

router.get("/nearby", getNearbyVenues)
router.get("/mine", mockAuth, getMyVenues)
router.get("/:id", getVenueById)
router.post("/", mockAuth, createVenue)

export default router