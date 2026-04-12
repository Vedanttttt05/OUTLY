import ApiError from "../utils/apiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const venueFeatureUnsupported = () => {
    throw new ApiError("Venues are not part of the current schema. Add venues table or disable venue routes.", "", [], 501)
}

export const createVenue = asyncHandler(async (req, res) => {
    venueFeatureUnsupported()
})

export const getNearbyVenues = asyncHandler(async (req, res) => {
    venueFeatureUnsupported()
})

export const getVenueById = asyncHandler(async (req, res) => {
    venueFeatureUnsupported()
})

export const getMyVenues = asyncHandler(async (req, res) => {
    venueFeatureUnsupported()
})