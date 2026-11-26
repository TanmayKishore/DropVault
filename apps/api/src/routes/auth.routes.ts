import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { registerBodySchema, loginBodySchema } from '../validators/auth.validator.js';

const router = Router();

router.post('/register', validateRequest({ body: registerBodySchema }), AuthController.register);
router.post('/login', validateRequest({ body: loginBodySchema }), AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);
router.get('/me', authenticateToken, AuthController.getMe);

export default router;
