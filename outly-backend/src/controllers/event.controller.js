import pool from "../db/connection.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { createEventQuery, getNearbyEventsQuery } from "../models/event.model.js"

export const createEvent = asyncHandler(async (req, res) => {

    const { title, description, lat, lng, userId } = req.body

    const result = await pool.query(createEventQuery, [
        title,
        description,
        lng,
        lat,
        userId
    ])

    res.json({
        success: true,
        data: result.rows[0]
    })
})

export const getNearbyEvents = asyncHandler(async (req, res) => {

    const { lat, lng } = req.query

    const result = await pool.query(getNearbyEventsQuery, [lng, lat])

    res.json({
        success: true,
        events: result.rows
    })
})