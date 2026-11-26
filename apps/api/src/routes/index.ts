import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import fileRoutes from './file.routes.js';
import shareRoutes from './share.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/files', fileRoutes);
router.use('/share', shareRoutes);

export default router;
