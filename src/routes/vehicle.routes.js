/**
 * HomeAccess - Vehicle Routes
 * ============================
 *
 * GET    /api/v1/vehicles                → listar (admin/portero: todos | residente: solo suyos)
 * POST   /api/v1/vehicles                → registrar vehículo (admin)
 * GET    /api/v1/vehicles/:id            → detalle de vehículo
 * PUT    /api/v1/vehicles/:id            → actualizar datos (admin) — placa inmutable
 * DELETE /api/v1/vehicles/:id            → eliminar soft delete (admin)
 * GET    /api/v1/vehicles/unit/:unitId   → vehículos de una unidad específica
 *
 * FILTROS disponibles en GET /vehicles:
 *   ?tipo=carro|moto|bicicleta|patineta|otro
 *   ?placa=ABC          búsqueda parcial
 *   ?unit_id=<id>
 *   ?con_puesto=true    con puesto asignado
 *   ?sin_puesto=true    sin puesto asignado
 *   ?page=1&limit=20
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl   = require('../controllers/vehicle.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(protect);

// ─── Helper: capturar errores de validación ───────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ─── Validators ───────────────────────────────────────────────────────────────

const createValidators = [
  body('unit_id')
    .notEmpty().withMessage('unit_id es requerido')
    .isMongoId().withMessage('unit_id inválido'),

  body('propietario_id')
    .notEmpty().withMessage('propietario_id es requerido')
    .isMongoId().withMessage('propietario_id inválido'),

  body('tipo')
    .notEmpty().withMessage('El tipo es requerido')
    .isIn(['carro', 'moto', 'bicicleta', 'patineta', 'otro'])
    .withMessage('Tipo inválido. Valores permitidos: carro, moto, bicicleta, patineta, otro'),

  // Placa: opcional en el validator — el controller valida si es obligatoria según tipo
  body('placa')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .toUpperCase()
    .matches(/^[A-Za-z]{3}[0-9]{2}[A-Za-z0-9]{1}$/)
    .withMessage('Formato de placa inválido (Ej: ABC123 para carro, XYZ45A para moto)'),

  body('marca')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }).withMessage('La marca no puede superar 50 caracteres'),

  body('modelo')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }).withMessage('El modelo no puede superar 50 caracteres'),

  body('color')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 30 }).withMessage('El color no puede superar 30 caracteres'),

  body('anio')
    .optional({ nullable: true })
    .isInt({ min: 1970, max: new Date().getFullYear() + 1 })
    .withMessage(`Año inválido. Rango permitido: 1970 - ${new Date().getFullYear() + 1}`),
];

const updateValidators = [
  body('tipo')
    .optional()
    .isIn(['carro', 'moto', 'bicicleta', 'patineta', 'otro'])
    .withMessage('Tipo inválido. Valores permitidos: carro, moto, bicicleta, patineta, otro'),

  body('marca')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }),

  body('modelo')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }),

  body('color')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 30 }),

  body('anio')
    .optional({ nullable: true })
    .isInt({ min: 1970, max: new Date().getFullYear() + 1 })
    .withMessage('Año inválido'),
];

const mongoIdParam = (paramName) =>
  param(paramName).isMongoId().withMessage(`${paramName} inválido`);

// ─── RUTAS ────────────────────────────────────────────────────────────────────

// IMPORTANTE: /unit/:unitId debe ir ANTES de /:id
// para que Express no interprete 'unit' como un ID de Mongo

// Vehículos por unidad residencial
router.get(
  '/unit/:unitId',
  mongoIdParam('unitId'),
  validate,
  ctrl.getVehiclesByUnit
);

// Listar todos los vehículos
router.get('/', ctrl.getVehicles);

// Registrar nuevo vehículo (admin)
router.post(
  '/',
  authorize('admin'),
  createValidators,
  validate,
  ctrl.createVehicle
);

// Detalle de un vehículo
router.get(
  '/:id',
  mongoIdParam('id'),
  validate,
  ctrl.getVehicleById
);

// Actualizar vehículo (admin) — placa es inmutable
router.put(
  '/:id',
  authorize('admin'),
  mongoIdParam('id'),
  updateValidators,
  validate,
  ctrl.updateVehicle
);

// Eliminar vehículo soft delete (admin)
router.delete(
  '/:id',
  authorize('admin'),
  mongoIdParam('id'),
  validate,
  ctrl.deleteVehicle
);

module.exports = router;
