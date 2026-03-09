import pool from "../db/connection.js"
import ApiResponse from "../utils/apiResponse.js"
import ApiError from "../utils/apiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { createEventQuery, getNearbyEventsQuery , joinEventQuery , getEventByIdQuery , leaveEventQuery} from "../models/event.model.js"

export const createEvent = asyncHandler(async (req, res) => {

    const { title, description, lat, lng } = req.body
    const userId = req.auth.userId

    const result = await pool.query(createEventQuery, [
        title,
        description,
        lng,
        lat,
        userId
    ])

    return res
        .status(201)
        .json(new ApiResponse(201, "Event created successfully", result.rows[0]))
})


export const getNearbyEvents = asyncHandler(async (req, res) => {

    const { lat, lng } = req.query

    if (!lat || !lng) {
        throw new ApiError("Latitude and longitude required", "", [], 400)
    }

    const result = await pool.query(getNearbyEventsQuery, [lng, lat])

    return res.json(
        new ApiResponse(200, "Nearby events fetched", result.rows)
    )
})


export const joinEvent = asyncHandler(async (req, res) => {

    const { id } = req.params
    const userId = req.auth.userId

    const event = await pool.query(getEventByIdQuery, [id])

    if (!event.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    if (event.rows[0].created_by === userId) {
        throw new ApiError("Cannot join your own event", "", [], 400)
    }

    const result = await pool.query(joinEventQuery, [
        userId,
        id
    ])

    return res.json(
        new ApiResponse(200, "Joined event successfully", result.rows[0])
    )
})


export const getEventById = asyncHandler(async (req, res) => {

    const { id } = req.params

    const result = await pool.query(getEventByIdQuery, [id])

    if (!result.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    return res.json(
        new ApiResponse(200, "Event fetched", result.rows[0])
    )
})


export const leaveEvent = asyncHandler(async (req, res) => {

    const { id } = req.params
    const userId = req.auth.userId

    const result = await pool.query(leaveEventQuery, [
        userId,
        id
    ])

    if (!result.rows.length) {
        throw new ApiError("User not part of this event", "", [], 400)
    }

    return res.json(
        new ApiResponse(
            200,
            "Left event successfully",
            { participants: result.rows[0].participants }
        )
    )
})
