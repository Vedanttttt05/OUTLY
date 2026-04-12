import { Router } from 'express';
import { requireAuth } from '@clerk/express';
import {
  getMyProfile,
  updateMyProfile,
  getUserProfileById,
  getUserEventsById,
  blockUser,
  unblockUser,
  getMyBlockedUsers,
  reportUser,
} from '../controllers/user.controller.js';

const router = Router();

router.get('/me/profile', requireAuth(), getMyProfile);
router.put('/me/profile', requireAuth(), updateMyProfile);
router.get('/me/blocked', requireAuth(), getMyBlockedUsers);
router.get('/:id/profile', requireAuth(), getUserProfileById);
router.get('/:id/events', requireAuth(), getUserEventsById);
router.post('/:id/block', requireAuth(), blockUser);
router.delete('/:id/block', requireAuth(), unblockUser);
router.post('/:id/report', requireAuth(), reportUser);

export default router;
