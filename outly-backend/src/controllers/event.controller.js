import pool from "../db/connection.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { createEventQuery, getNearbyEventsQuery , joinEventQuery , getEventByIdQuery , leaveEventQuery} from "../models/event.model.js"

export const createEvent = asyncHandler(async (req, res) => {

    const { title, description, lat, lng} = req.body
    const userId = req.auth.userId

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
    if(!lat || !lng){
  return res.status(400).json({
    success:false,
    message:"Latitude and longitude required"
  })
}

    const result = await pool.query(getNearbyEventsQuery, [lng, lat])

    res.json({
        success: true,
        events: result.rows
    })
})


export const joinEvent = asyncHandler(async (req,res)=>{

    const { id } = req.params
    const userId = req.auth.userId

    const event = await pool.query(getEventByIdQuery,[id])
    if (!event.rows.length) {
    return res.status(404).json({
    success: false,
    message: "Event not found"
  })
}

    if(event.rows[0].created_by === userId){
    return res.status(400).json({
    success:false,
    message:"Cannot join your own event"
  })
}

    const result = await pool.query(joinEventQuery,[
        userId,
        id
    ])
    
    

    res.json({
        success:true,
        data:result.rows[0]
    })
})

export const getEventById = asyncHandler(async (req,res)=>{

    const { id } = req.params

    const result = await pool.query(getEventByIdQuery,[id])

    res.json({
        success:true,
        data:result.rows[0]
    })
})

export const leaveEvent = asyncHandler(async (req, res) => {

    const { id } = req.params
    const userId = req.auth.userId

    const result = await pool.query(leaveEventQuery, [
  userId,
  id
])
if(!result.rows.length){
  return res.status(400).json({
    success:false,
    message:"User not part of this event"
  })
}

res.json({
  success: true,
  message: "Left event",
  participants: result.rows[0].participants
})
})

