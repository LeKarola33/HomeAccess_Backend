/**
 * HomeAccess - Package Routes
 * ============================
 *
 * GET    /api/v1/packages                  → listar paquetes
 * POST   /api/v1/packages                  → registrar llegada (admin/portero/vigilante)
 * GET    /api/v1/packages/:id              → detalle
 * PATCH  /api/v1/packages/:id/entregar     → marcar como entregado
 * PATCH  /api/v1/packages/:id/estado       → marcar devuelto | perdido (admin)
 * DELETE /api/v1/packages/:id              → eliminar (admin)
 *
 * Filtros GET: ?estado= ?unit_destino= ?page= ?limit=
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/package.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

// ─── Helper ───────────────────────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const mongoId = (name) =>
  param(name).isMongoId().withMessage(`${name} inválido`);

// ─── Validators ───────────────────────────────────────────────────────────────

const createValidators = [
  body('unit_destino')
    .notEmpty().withMessage('La unidad de destino es requerida')
    .isMongoId().withMessage('unit_destino inválido'),

  body('destinatario_id')
    .notEmpty().withMessage('El destinatario es requerido')
    .isMongoId().withMessage('destinatario_id inválido'),

  body('tipo')
    .optional()
    .isIn(['paquete', 'sobre', 'documento', 'perecedero', 'otro'])
    .withMessage('Tipo inválido: paquete, sobre, documento, perecedero, otro'),

  body('remitente')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }),

  body('transportadora')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 80 }),

  body('guia')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 60 }),

  body('descripcion')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 300 }),
];

const entregarValidators = [
  body('entregado_a')
    .optional({ nullable: true })
    .isMongoId().withMessage('entregado_a inválido'),
];

const estadoValidators = [
  body('estado')
    .notEmpty().withMessage('El estado es requerido')
    .isIn(['devuelto', 'perdido'])
    .withMessage('Estado inválido: devuelto, perdido'),
];

// ─── Rutas ────────────────────────────────────────────────────────────────────

router.get('/',    ctrl.getPackages);
router.post('/',   authorize('admin', 'portero', 'vigilante'), createValidators, validate, ctrl.createPackage);
router.get('/:id', mongoId('id'), validate, ctrl.getPackageById);

router.patch('/:id/entregar',
  authorize('admin', 'portero', 'vigilante'),
  mongoId('id'),
  entregarValidators,
  validate,
  ctrl.entregarPackage
);

router.patch('/:id/estado',
  authorize('admin'),
  mongoId('id'),
  estadoValidators,
  validate,
  ctrl.cambiarEstado
);

router.delete('/:id',
  authorize('admin'),
  mongoId('id'),
  validate,
  ctrl.deletePackage
);

module.exports = router;
