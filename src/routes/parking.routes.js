/**
 * HomeAccess - Parking Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/parking.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');
const Parking = require('../models/Parking.model'); // ← colección parkings

const router = express.Router();
router.use(protect);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

const vehicleValidators = [
  body('unit_id').notEmpty().isMongoId(),
  body('propietario_id').notEmpty().isMongoId(),
  body('placa').optional({ nullable: true }).trim().toUpperCase(),
  body('tipo').isIn(['carro', 'moto', 'bicicleta', 'patineta', 'otro']),
  body('marca').optional().trim().isLength({ max: 50 }),
  body('modelo').optional().trim().isLength({ max: 50 }),
  body('color').optional().trim().isLength({ max: 30 }),
  body('anio').optional().isInt({ min: 1970 }),
];

const assignValidators = [
  body('parqueadero_id').notEmpty().isMongoId(),
];

// Vehicles
router.get('/vehicles',        ctrl.getVehicles);
router.post('/vehicles',       authorize('admin'), vehicleValidators, validate, ctrl.createVehicle);
router.get('/vehicles/:id',    ctrl.getVehicleById);
router.put('/vehicles/:id',    authorize('admin'), ctrl.updateVehicle);
router.delete('/vehicles/:id', authorize('admin'), ctrl.deleteVehicle);

// Spot assignment
router.patch('/vehicles/:vehicleId/assign',   authorize('admin'), assignValidators, validate, ctrl.assignSpot);
router.patch('/vehicles/:vehicleId/unassign', authorize('admin'), ctrl.unassignSpot);

// Spots
router.get('/spots',         ctrl.getSpots);
router.get('/spots/:spotId', ctrl.getSpotById);

// By unit
router.get('/unit/:unitId', ctrl.getVehiclesByUnit);

// ── Bulk create parking spots → guarda en colección parkings ──────────────────
router.post('/spots/bulk-create', authorize('admin'), async (req, res, next) => {
  try {
    const total   = Math.min(200, parseInt(req.body.total) || 50);
    const prefijo = (req.body.prefijo || 'P').toUpperCase().substring(0, 3);

    let created = 0;
    let skipped = 0;

    for (let i = 1; i <= total; i++) {
      const numero = `${prefijo}-${String(i).padStart(2, '0')}`;

      // Verificar si ya existe en la colección parkings
      const exists = await Parking.findOne({ number: numero });
      if (exists) { skipped++; continue; }

      // Crear en la colección parkings con los campos del modelo
      await Parking.create({
        number: numero,
        type:   'car',
        status: 'available',
        active: true,
      });
      created++;
    }

    res.status(201).json({
      success: true,
      message: `${created} puestos creados en parkings, ${skipped} ya existían`,
      data: { created, skipped, total_requested: total },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;