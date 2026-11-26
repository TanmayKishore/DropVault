import { Router } from 'express';
import { FileController } from '../controllers/file.controller.js';
import { ShareLinkController } from '../controllers/share-link.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { optionalAuthenticateToken } from '../middleware/optionalAuth.middleware.js';

const router = Router();

// Account-wide file listing (Requires Authenticated User)
router.get('/', authenticateToken, FileController.list);

// Account-wide share links listing (Requires Authenticated User; must precede /:id)
router.get('/share-links', authenticateToken, ShareLinkController.list);

// Streaming file upload (Anonymous or Authenticated)
router.post('/upload', optionalAuthenticateToken, FileController.upload);

// File metadata (Requires Owner Bearer token or X-Management-Token)
router.get('/:id', optionalAuthenticateToken, FileController.getMetadata);

// File download (Requires Owner Bearer token or X-Management-Token)
router.get('/:id/download', optionalAuthenticateToken, FileController.download);

// File deletion (Requires Owner Bearer token or X-Management-Token)
router.delete('/:id', optionalAuthenticateToken, FileController.delete);

// Revoke anonymous management token
router.post('/:id/revoke-management', optionalAuthenticateToken, FileController.revokeManagement);

// Create additional public share link for a file
router.post('/:id/share-links', optionalAuthenticateToken, ShareLinkController.create);

// Revoke a specific share link
router.delete('/:id/share-links/:shareLinkId', optionalAuthenticateToken, ShareLinkController.revoke);

export default router;
