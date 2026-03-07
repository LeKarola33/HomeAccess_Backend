/**
 * HomeAccess - Unit Routes
 * ==========================
 *
 * GET    /api/v1/units                          → listar unidades (todos los roles)
 * POST   /api/v1/units                          → crear unidad (admin)
 * GET    /api/v1/units/:id                      → detalle de unidad
 * PUT    /api/v1/units/:id                      → actualizar unidad (admin)
 * DELETE /api/v1/units/:id                      → eliminar unidad (admin, soft delete)
 * POST   /api/v1/units/:id/mascotas             → agregar mascota (admin)
 * DELETE /api/v1/units/:id/mascotas/:mascotaId  → eliminar mascota (admin)
 *
 * FILTROS GET /units:
 *   ?estado=ocupado|desocupado|en_mantenimiento|en_venta
 *   ?tipo=apartamento|casa|local|bodega|parqueadero
 *   ?torre=A
 *   ?page=1&limit=20
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/unit.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ─── Helper validación ────────────────────────────────────────────────────────
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
  body('numero')
    .trim().notEmpty().withMessage('El número de unidad es requerido')
    .isLength({ max: 20 }).withMessage('Máximo 20 caracteres'),

  body('tipo')
    .optional()
    .isIn(['apartamento', 'casa', 'local', 'bodega', 'parqueadero'])
    .withMessage('Tipo inválido: apartamento, casa, local, bodega, parqueadero'),

  body('estado')
    .optional()
    .isIn(['ocupado', 'desocupado', 'en_mantenimiento', 'en_venta'])
    .withMessage('Estado inválido: ocupado, desocupado, en_mantenimiento, en_venta'),

  body('torre')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 10 }).withMessage('Torre máximo 10 caracteres'),

  body('piso')
    .optional({ nullable: true })
    .isInt({ min: -2, max: 200 }).withMessage('Piso inválido'),

  body('propietario_actual')
    .optional({ nullable: true })
    .isMongoId().withMessage('propietario_actual inválido'),
];

const updateValidators = [
  body('numero')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 }).withMessage('Número inválido'),

  body('tipo')
    .optional()
    .isIn(['apartamento', 'casa', 'local', 'bodega', 'parqueadero'])
    .withMessage('Tipo inválido'),

  body('estado')
    .optional()
    .isIn(['ocupado', 'desocupado', 'en_mantenimiento', 'en_venta'])
    .withMessage('Estado inválido'),

  body('torre')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 10 }),

  body('piso')
    .optional({ nullable: true })
    .isInt({ min: -2, max: 200 }),

  body('propietario_actual')
    .optional({ nullable: true })
    .isMongoId().withMessage('propietario_actual inválido'),
];

const mascotaValidators = [
  body('nombre')
    .trim().notEmpty().withMessage('El nombre de la mascota es requerido')
    .isLength({ max: 50 }),
  body('especie')
    .trim().notEmpty().withMessage('La especie es requerida')
    .isIn(['perro', 'gato', 'ave', 'pez', 'reptil', 'otro'])
    .withMessage('Especie inválida: perro, gato, ave, pez, reptil, otro'),
  body('raza')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }),
];

// ─── Rutas ────────────────────────────────────────────────────────────────────

// Listar
router.get('/', ctrl.getUnits);

// Crear (admin)
router.post('/',
  authorize('admin'),
  createValidators,
  validate,
  ctrl.createUnit
);

// Detalle
router.get('/:id',
  mongoId('id'),
  validate,
  ctrl.getUnitById
);

// Actualizar (admin)
router.put('/:id',
  authorize('admin'),
  mongoId('id'),
  updateValidators,
  validate,
  ctrl.updateUnit
);

// Eliminar soft delete (admin)
router.delete('/:id',
  authorize('admin'),
  mongoId('id'),
  validate,
  ctrl.deleteUnit
);

// ─── Mascotas ─────────────────────────────────────────────────────────────────

router.post('/:id/mascotas',
  authorize('admin'),
  mongoId('id'),
  mascotaValidators,
  validate,
  ctrl.addMascota
);

router.delete('/:id/mascotas/:mascotaId',
  authorize('admin'),
  mongoId('id'),
  mongoId('mascotaId'),
  validate,
  ctrl.removeMascota
);

module.exports = router;
