/**
 * HomeAccess - Rutas de Control de Acceso
 * ========================================
 * POST /api/v1/access-logs           -> registrar acceso (portero/admin)
 * GET  /api/v1/access-logs           -> listar registros (portero/admin)
 * GET  /api/v1/access-logs/active    -> personas actualmente adentro
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const accessController = require('../controllers/access.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const accessLogValidators = [
  body('tipo_persona').isIn(['residente', 'visitante', 'proveedor', 'empleado', 'delivery'])
    .withMessage('Tipo de persona inválido'),
  body('tipo_acceso').isIn(['entrada', 'salida']).withMessage('Tipo de acceso inválido'),
  body('porteria').notEmpty().withMessage('Portería requerida'),
];

router.get('/active', authorize('admin', 'portero', 'vigilante'), accessController.getActivePeople);
router.get('/', authorize('admin', 'portero', 'vigilante'), accessController.getAccessLogs);
router.post('/', authorize('admin', 'portero', 'vigilante'), accessLogValidators, validate, accessController.createAccessLog);

module.exports = router;
