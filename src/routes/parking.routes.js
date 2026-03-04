/**
 * HomeAccess - Rutas de Parqueadero
 * ===================================
 *
 * VEHÍCULOS:
 *   GET    /api/v1/parqueadero/vehiculos              → listar todos (admin/portero) o propios (residente)
 *   POST   /api/v1/parqueadero/vehiculos              → registrar vehículo (admin)
 *   GET    /api/v1/parqueadero/vehiculos/:id          → detalle de vehículo
 *   PUT    /api/v1/parqueadero/vehiculos/:id          → actualizar datos (admin)
 *   DELETE /api/v1/parqueadero/vehiculos/:id          → eliminar (soft delete, admin)
 *
 * ASIGNACIÓN DE PUESTO:
 *   PATCH  /api/v1/parqueadero/vehiculos/:id/asignar      → asignar puesto a vehículo (admin)
 *   PATCH  /api/v1/parqueadero/vehiculos/:id/desasignar   → liberar puesto (admin)
 *
 * PUESTOS:
 *   GET    /api/v1/parqueadero/puestos                → listar puestos con estado y vehículo
 *   GET    /api/v1/parqueadero/puestos/:puestoId      → detalle de puesto
 *
 * VISTA POR UNIDAD:
 *   GET    /api/v1/parqueadero/unidad/:unitId         → vehículos y puestos de un apto
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/parking.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// ─── Validador de errores ────────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ─── Validadores ──────────────────────────────────────────────────────────────

const vehiculoValidators = [
  body('unit_id')
    .notEmpty().withMessage('unit_id es requerido')
    .isMongoId().withMessage('unit_id inválido'),
  body('propietario_id')
    .notEmpty().withMessage('propietario_id es requerido')
    .isMongoId().withMessage('propietario_id inválido'),
  body('placa')
    .trim().notEmpty().withMessage('La placa es requerida')
    .matches(/^[A-Za-z]{3}[0-9]{2}[A-Za-z0-9]{1}$/)
    .withMessage('Formato de placa inválido (Ej: ABC123)'),
  body('tipo')
    .isIn(['carro', 'moto', 'bicicleta', 'otro'])
    .withMessage('Tipo inválido: carro, moto, bicicleta, otro'),
  body('marca').optional().trim().isLength({ max: 50 }),
  body('modelo').optional().trim().isLength({ max: 50 }),
  body('color').optional().trim().isLength({ max: 30 }),
  body('anio').optional().isInt({ min: 1970 }).withMessage('Año inválido'),
];

const asignarValidators = [
  body('parqueadero_id')
    .notEmpty().withMessage('parqueadero_id es requerido')
    .isMongoId().withMessage('parqueadero_id inválido'),
];

// ─── Rutas de Vehículos ───────────────────────────────────────────────────────

// Listar: admin/portero ven todos; residente ve solo los de su unidad
router.get('/vehiculos', ctrl.getVehiculos);

// Registrar vehículo (admin)
router.post(
  '/vehiculos',
  authorize('admin'),
  vehiculoValidators,
  validate,
  ctrl.registrarVehiculo
);

// Detalle de vehículo (todos los roles autenticados)
router.get('/vehiculos/:id', ctrl.getVehiculoById);

// Actualizar datos del vehículo (admin)
router.put('/vehiculos/:id', authorize('admin'), ctrl.actualizarVehiculo);

// Eliminar vehículo - soft delete (admin)
router.delete('/vehiculos/:id', authorize('admin'), ctrl.eliminarVehiculo);

// ─── Asignación de parqueadero ────────────────────────────────────────────────

// Asignar puesto a un vehículo
router.patch(
  '/vehiculos/:vehiculoId/asignar',
  authorize('admin'),
  asignarValidators,
  validate,
  ctrl.asignarParqueadero
);

// Liberar puesto de un vehículo
router.patch(
  '/vehiculos/:vehiculoId/desasignar',
  authorize('admin'),
  ctrl.desasignarParqueadero
);

// ─── Rutas de Puestos ─────────────────────────────────────────────────────────

// Mapa completo de puestos: todos los roles (portería necesita consultar)
router.get('/puestos', ctrl.getPuestos);

// Detalle de un puesto específico
router.get('/puestos/:puestoId', ctrl.getPuestoById);

// ─── Vista por unidad residencial ─────────────────────────────────────────────

// Vehículos y puestos de un apartamento específico
router.get('/unidad/:unitId', ctrl.getParqueaderoByUnidad);

module.exports = router;
