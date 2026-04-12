import pool from "../db/connection.js"
import ApiResponse from "../utils/apiResponse.js"
import ApiError from "../utils/apiError.js"
import { syncUserFromClerk } from "../utils/syncUser.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import {
    createEventQuery,
    getNearbyEventsQuery,
    upsertParticipationRequestQuery,
    getEventByIdQuery,
    leaveEventQuery,
    getMyEventsQuery,
    getEventByIdForActionQuery,
    countAcceptedParticipantsQuery,
    getEventPendingParticipantsQuery,
    updateParticipantStatusQuery,
    getParticipantStatusQuery,
    deactivateExpiredEventsQuery,
    markEventCompletedByCreatorQuery,
    deleteEventParticipantsByEventIdQuery,
    deleteEventMessagesByEventIdQuery,
    deleteEventByCreatorQuery,
} from "../models/event.model.js"
import { isBlockedBetweenUsers } from "../utils/safety.js"

const normalizeOptionalDate = (value) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const isEventExpired = (eventRow) => {
    if (eventRow?.is_active === false) return true
    if (!eventRow?.live_until) return false
    return new Date(eventRow.live_until).getTime() <= Date.now()
}

const serializeEventRow = (row, viewerId = null) => {
    const acceptedParticipants = Array.isArray(row.accepted_participants) ? row.accepted_participants : []
    const pendingParticipants = Array.isArray(row.pending_participants) ? row.pending_participants : []
    const rejectedParticipants = Array.isArray(row.rejected_participants) ? row.rejected_participants : []
    const isCreator = viewerId && row.creator_id === viewerId

    return {
        id: row.id,
        title: row.title,
        description: row.description,
        createdBy: row.creator_id,
        created_at: row.created_at,
        eventDateTime: row.event_date_time,
        expiresAt: row.expires_at,
        maxParticipants: row.max_participants,
        participant_count: row.participant_count,
        pending_count: row.pending_count,
        is_full: row.is_full,
        is_expired: row.is_expired,
        currentUserStatus: row.current_user_status || null,
        latitude: row.latitude,
        longitude: row.longitude,
        creator: {
            userId: row.creator_id,
            firstName: row.creator_first_name,
            lastName: row.creator_last_name,
            email: row.creator_email,
            profileImageUrl: row.creator_profile_image_url,
            isVerified: row.creator_is_verified,
        },
        acceptedParticipants,
        pendingParticipants: isCreator ? pendingParticipants : [],
        rejectedParticipants: isCreator ? rejectedParticipants : [],
    }
}

export const createEvent = asyncHandler(async (req, res) => {
    const { title, description, lat, lng, maxParticipants, eventDateTime, expiresAt } = req.body
  const userId = req.auth().userId

    const parsedMaxParticipants =
        maxParticipants === undefined || maxParticipants === null || maxParticipants === ''
            ? null
            : Number(maxParticipants)

    if (parsedMaxParticipants !== null && (!Number.isInteger(parsedMaxParticipants) || parsedMaxParticipants < 1)) {
        throw new ApiError("maxParticipants must be a positive integer", "", [], 400)
    }

    const parsedEventDateTime = normalizeOptionalDate(eventDateTime)
    const parsedExpiresAt = normalizeOptionalDate(expiresAt) || parsedEventDateTime

    if (eventDateTime && !parsedEventDateTime) {
        throw new ApiError("Invalid eventDateTime", "", [], 400)
    }

    if (expiresAt && !normalizeOptionalDate(expiresAt)) {
        throw new ApiError("Invalid expiresAt", "", [], 400)
    }

  const result = await pool.query(createEventQuery, [
    title,
    description,
    lng,
    lat,
    userId,
        parsedMaxParticipants,
        parsedEventDateTime,
        parsedExpiresAt,
  ])

  return res
    .status(201)
    .json(new ApiResponse(201, "Event created successfully", result.rows[0]))
})


export const getNearbyEvents = asyncHandler(async (req, res) => {

    const { lat, lng, radiusKm, radius } = req.query

    if (!lat || !lng) {
        throw new ApiError("Latitude and longitude required", "", [], 400)
    }

    const parsedRadiusKm = Number(radiusKm)
    const parsedRadiusMeters = Number(radius)

    let radiusMeters = 5000
    if (Number.isFinite(parsedRadiusKm) && parsedRadiusKm > 0) {
        radiusMeters = parsedRadiusKm * 1000
    } else if (Number.isFinite(parsedRadiusMeters) && parsedRadiusMeters > 0) {
        radiusMeters = parsedRadiusMeters
    }

    radiusMeters = Math.min(Math.max(radiusMeters, 1000), 50000)

    await pool.query(deactivateExpiredEventsQuery)

    const result = await pool.query(getNearbyEventsQuery, [lng, lat, radiusMeters])

    return res.json(
        new ApiResponse(200, "Nearby events fetched", result.rows)
    )
})


export const joinEvent = asyncHandler(async (req, res) => {

    const { id } = req.params
    const userId = req.auth().userId

        const event = await pool.query(getEventByIdForActionQuery, [id])

    if (!event.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    if (event.rows[0].creator_id === userId) {
        throw new ApiError("Cannot join your own event", "", [], 400)
    }

        if (isEventExpired(event.rows[0])) {
                throw new ApiError("Event has expired", "", [], 400)
        }

        const blockedWithCreator = await isBlockedBetweenUsers(userId, event.rows[0].creator_id)
        if (blockedWithCreator) {
                throw new ApiError("Cannot join this event due to user safety restrictions", "", [], 403)
        }

        const existingStatusResult = await pool.query(getParticipantStatusQuery, [id, userId])
        const hasExistingParticipation = existingStatusResult.rows.length > 0
        const existingStatus = hasExistingParticipation
            ? (existingStatusResult.rows[0]?.status || 'accepted')
            : null

        if (existingStatus === 'accepted') {
            return res.json(
                new ApiResponse(200, "Already accepted in this event", { status: 'accepted' })
            )
        }

        const participantsResult = await pool.query(
            `SELECT user_id
             FROM event_participants
             WHERE event_id = $1
             AND (status = 'accepted' OR status IS NULL)`,
            [id]
        )

        for (const participant of participantsResult.rows) {
            if (participant.user_id === userId) continue
            const blocked = await isBlockedBetweenUsers(userId, participant.user_id)
            if (blocked) {
                throw new ApiError("Cannot join this event due to block settings", "", [], 403)
            }
        }

        const result = await pool.query(upsertParticipationRequestQuery, [
        userId,
        id
    ])

    return res.json(
                new ApiResponse(200, "Interest sent to creator. Waiting for approval.", result.rows[0])
    )
})


export const getEventById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const viewerId = req.auth?.()?.userId || null;

  await pool.query(deactivateExpiredEventsQuery);

  const result = await pool.query(getEventByIdQuery, [id, viewerId]);

  if (!result.rows.length) {
    throw new ApiError("Event not found", "", [], 404);
  }

  const row = result.rows[0];

    if (row.is_active === false || row.is_expired) {
        throw new ApiError("Event not found", "", [], 404);
    }

  if (!row.creator_first_name && !row.creator_last_name) {
    try {
      await syncUserFromClerk(row.creator_id);

      // Re-fetch after sync so row has updated names
      const refreshed = await pool.query(getEventByIdQuery, [id, viewerId]);
      Object.assign(row, refreshed.rows[0]);
    } catch (err) {
      console.error("Failed to sync creator from Clerk:", err);
    }
  }

  const blockedWithCreator = viewerId
    ? await isBlockedBetweenUsers(viewerId, row.creator_id)
    : false;

  if (blockedWithCreator) {
    throw new ApiError("Event unavailable", "", [], 403);
  }

  return res.json(
    new ApiResponse(200, "Event fetched", serializeEventRow(row, viewerId))
  );
});

export const leaveEvent = asyncHandler(async (req, res) => {

    const { id } = req.params
    const userId = req.auth().userId

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

export const getMyEvents = asyncHandler(async (req, res) => {
  const userId = req.auth().userId  // same as createEvent, joinEvent, leaveEvent

    await pool.query(deactivateExpiredEventsQuery)

  const result = await pool.query(getMyEventsQuery, [userId])

  return res.json(
    new ApiResponse(200, "My events fetched", result.rows)
  )
})

export const getInterestedUsers = asyncHandler(async (req, res) => {
    const { id } = req.params
    const userId = req.auth().userId

    const eventResult = await pool.query(getEventByIdForActionQuery, [id])
    if (!eventResult.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    if (eventResult.rows[0].creator_id !== userId) {
        throw new ApiError("Only event creator can view interested users", "", [], 403)
    }

    const pendingResult = await pool.query(getEventPendingParticipantsQuery, [id])

    return res.json(new ApiResponse(200, "Interested users fetched", pendingResult.rows))
})

export const reviewInterestedUser = asyncHandler(async (req, res) => {
    const { id, participantId } = req.params
    const { status } = req.body
    const userId = req.auth().userId

    if (!['accepted', 'rejected'].includes(status)) {
        throw new ApiError("Status must be accepted or rejected", "", [], 400)
    }

    const eventResult = await pool.query(getEventByIdForActionQuery, [id])
    if (!eventResult.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    const event = eventResult.rows[0]
    if (event.creator_id !== userId) {
        throw new ApiError("Only event creator can review interested users", "", [], 403)
    }

    if (isEventExpired(event)) {
        throw new ApiError("Cannot review users for expired event", "", [], 400)
    }

    if (status === 'accepted') {
        const blocked = await isBlockedBetweenUsers(userId, participantId)
        if (blocked) {
            throw new ApiError("Cannot accept blocked user", "", [], 403)
        }

        const acceptedCountResult = await pool.query(countAcceptedParticipantsQuery, [id])
        const acceptedCount = acceptedCountResult.rows[0]?.accepted_count || 0
        if (event.max_participants && acceptedCount >= event.max_participants) {
            throw new ApiError("Event is full", "", [], 400)
        }
    }

    const result = await pool.query(updateParticipantStatusQuery, [id, participantId, status])
    if (!result.rows.length) {
        throw new ApiError("Participant request not found", "", [], 404)
    }

    return res.json(new ApiResponse(200, `Participant ${status}`, result.rows[0]))
})

export const markEventCompleted = asyncHandler(async (req, res) => {
    const { id } = req.params
    const userId = req.auth().userId

    const eventResult = await pool.query(getEventByIdForActionQuery, [id])
    if (!eventResult.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    const event = eventResult.rows[0]
    if (event.creator_id !== userId) {
        throw new ApiError("Only event creator can mark event as completed", "", [], 403)
    }

    if (isEventExpired(event)) {
        return res.json(new ApiResponse(200, "Event already completed", {
            id,
            is_active: false,
        }))
    }

    const result = await pool.query(markEventCompletedByCreatorQuery, [id, userId])
    if (!result.rows.length) {
        throw new ApiError("Could not mark event as completed", "", [], 400)
    }

    return res.json(new ApiResponse(200, "Event marked as completed", result.rows[0]))
})

export const deleteEvent = asyncHandler(async (req, res) => {
    const { id } = req.params
    const userId = req.auth().userId

    const eventResult = await pool.query(getEventByIdForActionQuery, [id])
    if (!eventResult.rows.length) {
        throw new ApiError("Event not found", "", [], 404)
    }

    if (eventResult.rows[0].creator_id !== userId) {
        throw new ApiError("Only event creator can delete event", "", [], 403)
    }

    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        await client.query(deleteEventMessagesByEventIdQuery, [id])
        await client.query(deleteEventParticipantsByEventIdQuery, [id])

        const deleteEventResult = await client.query(deleteEventByCreatorQuery, [id, userId])
        if (!deleteEventResult.rows.length) {
            throw new ApiError("Could not delete event", "", [], 400)
        }

        await client.query("COMMIT")
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }

    return res.json(new ApiResponse(200, "Event deleted", { id }))
})