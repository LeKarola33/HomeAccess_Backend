/**
 * HomeAccess - Unit Routes
 */
const Unit = require('../models/Unit.model');
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/unit.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

const mongoId = (name) => param(name).isMongoId().withMessage(`${name} inválido`);

const createValidators = [
  body('numero').trim().notEmpty().withMessage('El número de unidad es requerido').isLength({ max: 20 }),
  body('tipo').optional().isIn(['apartamento', 'casa', 'local', 'bodega', 'parqueadero']),
  body('estado').optional().isIn(['ocupado', 'desocupado', 'en_mantenimiento', 'en_venta']),
  body('torre').optional({ nullable: true }).trim().isLength({ max: 10 }),
  body('piso').optional({ nullable: true }).isInt({ min: -2, max: 200 }),
  body('propietario_actual').optional({ nullable: true }).isMongoId(),
];

const updateValidators = [
  body('numero').optional().trim().isLength({ min: 1, max: 20 }),
  body('tipo').optional().isIn(['apartamento', 'casa', 'local', 'bodega', 'parqueadero']),
  body('estado').optional().isIn(['ocupado', 'desocupado', 'en_mantenimiento', 'en_venta']),
  body('torre').optional({ nullable: true }).trim().isLength({ max: 10 }),
  body('piso').optional({ nullable: true }).isInt({ min: -2, max: 200 }),
  body('propietario_actual').optional({ nullable: true }).isMongoId(),
];

const mascotaValidators = [
  body('nombre').trim().notEmpty().isLength({ max: 50 }),
  body('especie').trim().notEmpty().isIn(['perro', 'gato', 'ave', 'pez', 'reptil', 'otro']),
  body('raza').optional({ nullable: true }).trim().isLength({ max: 50 }),
];

// ── IMPORTANTE: bulk-create ANTES de /:id para que Express no lo confunda ────
router.post('/bulk-create-apartments', authorize('admin'), async (req, res, next) => {
  try {
    const { torres, pisos, aptos_por_piso, total, prefijo } = req.body;
    const created = [];
    const skipped = [];

    if (torres && pisos && aptos_por_piso) {
      for (const torre of torres) {
        for (let piso = 1; piso <= pisos; piso++) {
          for (let apto = 1; apto <= aptos_por_piso; apto++) {
            const numero = `${piso}0${apto}`;
            const exists = await Unit.findOne({ numero, torre });
            if (exists) { skipped.push(`${torre}-${numero}`); continue; }
            await Unit.create({
              numero, torre, piso,
              tipo: 'apartamento', estado: 'desocupado',
              conjunto_id: req.user.conjunto_id || undefined,
            });
            created.push(numero);
          }
        }
      }
    } else if (total) {
      const pref = prefijo || '';
      for (let i = 1; i <= Math.min(total, 500); i++) {
        const numero = pref ? `${pref}-${String(i).padStart(3, '0')}` : String(i).padStart(3, '0');
        const exists = await Unit.findOne({ numero });
        if (exists) { skipped.push(numero); continue; }
        await Unit.create({
          numero, tipo: 'apartamento', estado: 'desocupado',
          conjunto_id: req.user.conjunto_id || undefined,
        });
        created.push(numero);
      }
    } else {
      return res.status(400).json({ success: false, message: 'Envía torres+pisos+aptos_por_piso o total' });
    }

    res.status(201).json({
      success: true,
      message: `${created.length} apartamentos creados, ${skipped.length} ya existían`,
      data: { created: created.length, skipped: skipped.length },
    });
  } catch (error) { next(error); }
});

// ── Rutas CRUD ────────────────────────────────────────────────
router.get('/', ctrl.getUnits);
router.post('/', authorize('admin'), createValidators, validate, ctrl.createUnit);
router.get('/:id', mongoId('id'), validate, ctrl.getUnitById);
router.put('/:id', authorize('admin'), mongoId('id'), updateValidators, validate, ctrl.updateUnit);
router.delete('/:id', authorize('admin'), mongoId('id'), validate, ctrl.deleteUnit);

// ── Mascotas ──────────────────────────────────────────────────
router.post('/:id/mascotas', authorize('admin'), mongoId('id'), mascotaValidators, validate, ctrl.addMascota);
router.delete('/:id/mascotas/:mascotaId', authorize('admin'), mongoId('id'), mongoId('mascotaId'), validate, ctrl.removeMascota);

module.exports = router; 