import { Router } from "express"
import { requireAuth } from "@clerk/express"
import { createVenue, getNearbyVenues, getVenueById, getMyVenues } from "../controllers/venue.controller.js"

const router = Router()

router.get("/nearby", getNearbyVenues)
router.get("/mine", requireAuth(), getMyVenues)
router.get("/:id", getVenueById)
router.post("/", requireAuth(), createVenue)

export default router