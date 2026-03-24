import pool from "../db/connection.js"
import ApiResponse from "../utils/apiResponse.js"
import ApiError from "../utils/apiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { createVenueQuery, getVenueByIdQuery, getNearbyVenuesQuery, getMyVenuesQuery } from "../models/venue.model.js"

export const createVenue = asyncHandler(async (req, res) => {
    const { name, lat, lng, category } = req.body
    const userId = req.auth.userId

    const result = await pool.query(createVenueQuery, [name, userId, lng, lat, category])

    return res.status(201).json(
        new ApiResponse(201, "Venue created successfully", result.rows[0])
    )
})

export const getNearbyVenues = asyncHandler(async (req, res) => {
    const { lat, lng } = req.query

    if (!lat || !lng) throw new ApiError("lat and lng required", "", [], 400)

    const result = await pool.query(getNearbyVenuesQuery, [lng, lat])

    return res.json(new ApiResponse(200, "Nearby venues fetched", result.rows))
})

export const getVenueById = asyncHandler(async (req, res) => {
    const { id } = req.params

    const result = await pool.query(getVenueByIdQuery, [id])

    if (!result.rows.length) throw new ApiError("Venue not found", "", [], 404)

    return res.json(new ApiResponse(200, "Venue fetched", result.rows[0]))
})

export const getMyVenues = asyncHandler(async (req, res) => {
    const userId = req.auth.userId

    const result = await pool.query(getMyVenuesQuery, [userId])

    return res.json(new ApiResponse(200, "Your venues", result.rows))
})