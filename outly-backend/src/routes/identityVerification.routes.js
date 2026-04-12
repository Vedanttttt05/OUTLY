import { Router } from 'express';
import { requireAuth } from '@clerk/express';
import {
  submitIdentityVerificationRequest,
  updateMyVerificationRequest,
  deleteMyVerificationRequest,
  getMyLatestVerificationRequest,
  renderVerificationAdminPanel,
  getVerificationRequestsForAdmin,
  getVerificationRequestByIdForAdmin,
  reviewVerificationRequest,
} from '../controllers/identityVerification.controller.js';

const router = Router();

router.post('/request', requireAuth(), submitIdentityVerificationRequest);
router.put('/my/request', requireAuth(), updateMyVerificationRequest);
router.delete('/my/request', requireAuth(), deleteMyVerificationRequest);
router.get('/my/latest', requireAuth(), getMyLatestVerificationRequest);
router.get('/admin/ui', renderVerificationAdminPanel);
router.get('/admin/requests', getVerificationRequestsForAdmin);
router.get('/admin/requests/:id', getVerificationRequestByIdForAdmin);
router.patch('/admin/requests/:id', reviewVerificationRequest);

export default router;
