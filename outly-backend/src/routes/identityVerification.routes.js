import { Router } from 'express';
import { requireAuth } from '@clerk/express';
import {
  submitIdentityVerificationRequest,
  getMyLatestVerificationRequest,
  getVerificationRequestsForAdmin,
  reviewVerificationRequest,
} from '../controllers/identityVerification.controller.js';

const router = Router();

router.post('/request', requireAuth(), submitIdentityVerificationRequest);
router.get('/my/latest', requireAuth(), getMyLatestVerificationRequest);
router.get('/admin/requests', requireAuth(), getVerificationRequestsForAdmin);
router.patch('/admin/requests/:id', requireAuth(), reviewVerificationRequest);

export default router;
