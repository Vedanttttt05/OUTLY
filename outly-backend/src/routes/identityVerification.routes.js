import { Router } from 'express';
import { requireAuth } from '@clerk/express';
import {
  submitIdentityVerificationRequest,
  getMyLatestVerificationRequest,
  renderVerificationAdminPanel,
  getVerificationRequestsForAdmin,
  reviewVerificationRequest,
} from '../controllers/identityVerification.controller.js';

const router = Router();

router.post('/request', requireAuth(), submitIdentityVerificationRequest);
router.get('/my/latest', requireAuth(), getMyLatestVerificationRequest);
router.get('/admin/ui', renderVerificationAdminPanel);
router.get('/admin/requests', getVerificationRequestsForAdmin);
router.patch('/admin/requests/:id', reviewVerificationRequest);

export default router;
