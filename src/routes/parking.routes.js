/**
 * HomeAccess - Parking Routes
 * ============================
 *
 * VEHICLES:
 *   GET    /api/v1/parking/vehicles                       → list all (admin/security) or own (resident)
 *   POST   /api/v1/parking/vehicles                       → register vehicle (admin)
 *   GET    /api/v1/parking/vehicles/:id                   → vehicle detail
 *   PUT    /api/v1/parking/vehicles/:id                   → update data (admin)
 *   DELETE /api/v1/parking/vehicles/:id                   → soft delete (admin)
 *
 * SPOT ASSIGNMENT:
 *   PATCH  /api/v1/parking/vehicles/:vehicleId/assign     → assign spot (admin)
 *   PATCH  /api/v1/parking/vehicles/:vehicleId/unassign   → free spot (admin)
 *
 * SPOTS:
 *   GET    /api/v1/parking/spots                          → list spots with status and vehicle
 *   GET    /api/v1/parking/spots/:spotId                  → spot detail
 *
 * BY UNIT:
 *   GET    /api/v1/parking/unit/:unitId                   → vehicles and spots for an apartment
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/parking.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ─── Validation error handler ─────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ─── Validators ───────────────────────────────────────────────────────────────

const vehicleValidators = [
  body('unit_id')
    .notEmpty().withMessage('unit_id is required')
    .isMongoId().withMessage('unit_id is invalid'),
  body('propietario_id')
    .notEmpty().withMessage('propietario_id is required')
    .isMongoId().withMessage('propietario_id is invalid'),
  body('placa')
    .optional({ nullable: true })
    .trim()
    .matches(/^[A-Za-z]{3}[0-9]{2}[A-Za-z0-9]{1}$/)
    .withMessage('Formato de placa inválido (Ej: ABC123)')
    .toUpperCase(),
  body('tipo')
    .isIn(['carro', 'moto', 'bicicleta', 'patineta', 'otro'])
    .withMessage('Tipo inválido. Valores permitidos: carro, moto, bicicleta, patineta, otro'),
  body('marca').optional().trim().isLength({ max: 50 }),
  body('modelo').optional().trim().isLength({ max: 50 }),
  body('color').optional().trim().isLength({ max: 30 }),
  body('anio').optional().isInt({ min: 1970 }).withMessage('Invalid year'),
];

const assignValidators = [
  body('parqueadero_id')
    .notEmpty().withMessage('parqueadero_id is required')
    .isMongoId().withMessage('parqueadero_id is invalid'),
];

// ─── Vehicle routes ───────────────────────────────────────────────────────────

router.get('/vehicles',        ctrl.getVehicles);
router.post('/vehicles',       authorize('admin'), vehicleValidators, validate, ctrl.createVehicle);
router.get('/vehicles/:id',    ctrl.getVehicleById);
router.put('/vehicles/:id',    authorize('admin'), ctrl.updateVehicle);
router.delete('/vehicles/:id', authorize('admin'), ctrl.deleteVehicle);

// ─── Spot assignment ──────────────────────────────────────────────────────────

router.patch('/vehicles/:vehicleId/assign',   authorize('admin'), assignValidators, validate, ctrl.assignSpot);
router.patch('/vehicles/:vehicleId/unassign', authorize('admin'), ctrl.unassignSpot);

// ─── Spot routes ──────────────────────────────────────────────────────────────

router.get('/spots',         ctrl.getSpots);
router.get('/spots/:spotId', ctrl.getSpotById);

// ─── By unit ──────────────────────────────────────────────────────────────────

router.get('/unit/:unitId',  ctrl.getVehiclesByUnit);

module.exports = router;