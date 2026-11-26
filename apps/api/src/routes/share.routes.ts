import { Router } from 'express';
import { ShareLinkController } from '../controllers/share-link.controller.js';
import { shareDownloadRateLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();

// Public link metadata (safe info only - unthrottled for viewing)
router.get('/:shortCode', ShareLinkController.getPublicInfo);

// Public link password pre-verification (rate-limited, does not consume download count)
router.post('/:shortCode/verify-password', shareDownloadRateLimiter, ShareLinkController.verifyPassword);

// Public link download (password-protected & atomic count decrement with brute-force rate limiter)
// Password brute-force protection applies to requests attempting password authentication
router.get('/:shortCode/download', (req, res, next) => {
  // If request contains a password attempt or target requires brute-force check
  if (req.headers['x-share-password'] || req.body?.password) {
    return shareDownloadRateLimiter(req, res, next);
  }
  next();
}, ShareLinkController.download);

router.post('/:shortCode/download', shareDownloadRateLimiter, ShareLinkController.download);

export default router;
