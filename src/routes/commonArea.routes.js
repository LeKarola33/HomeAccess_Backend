/**
 * HomeAccess - Rutas de Áreas Comunes y Reservas
 * ================================================
 *
 * ÁREAS:
 *   GET    /api/v1/areas                          → listar áreas (todos)
 *   POST   /api/v1/areas                          → crear área (admin)
 *   GET    /api/v1/areas/:id                      → detalle (todos)
 *   PUT    /api/v1/areas/:id                      → actualizar (admin)
 *   PATCH  /api/v1/areas/:id/estado               → cambiar estado (admin)
 *   PATCH  /api/v1/areas/:id/bloquear-unidad      → bloquear unidad (admin)
 *   PATCH  /api/v1/areas/:id/desbloquear-unidad   → desbloquear unidad (admin)
 *
 * RESERVAS (anidadas bajo el área):
 *   GET    /api/v1/areas/:id/disponibilidad       → franjas libres por fecha (todos)
 *   GET    /api/v1/areas/:id/reservas             → listar reservas (admin: todas / residente: propias)
 *   POST   /api/v1/areas/:id/reservas             → crear reserva (residente/propietario)
 *   PATCH  /api/v1/areas/:areaId/reservas/:reservaId/aprobar   → aprobar (admin)
 *   PATCH  /api/v1/areas/:areaId/reservas/:reservaId/rechazar  → rechazar (admin)
 *   PATCH  /api/v1/areas/:areaId/reservas/:reservaId/cancelar  → cancelar (admin o propio residente)
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const ctrl = require('../controllers/commonArea.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas requieren autenticación
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

const crearAreaValidators = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 80 }).withMessage('Máximo 80 caracteres'),
  body('tipo')
    .isIn(['salon_eventos', 'piscina', 'bbq', 'cancha', 'gimnasio', 'parque', 'otro'])
    .withMessage('Tipo inválido'),
  body('capacidad_maxima').optional().isInt({ min: 1 }).withMessage('Capacidad mínima: 1'),
  body('requiere_aprobacion').optional().isBoolean(),
  body('anticipacion_minima_horas').optional().isInt({ min: 0 }),
  body('franjas_horarias').optional().isArray({ min: 1 })
    .withMessage('Debe incluir al menos una franja horaria'),
];

const estadoValidators = [
  body('estado')
    .isIn(['activa', 'sin_servicio', 'mantenimiento'])
    .withMessage('Estado inválido. Use: activa, sin_servicio o mantenimiento'),
  body('motivo_bloqueo').optional().trim(),
  body('fecha_reapertura').optional().isISO8601().withMessage('Fecha inválida (use YYYY-MM-DD)'),
];

const bloquearUnidadValidators = [
  body('unit_id').notEmpty().withMessage('unit_id es requerido')
    .isMongoId().withMessage('unit_id inválido'),
  body('motivo').optional().trim(),
];

const createBookingValidators = [
  body('unit_id').notEmpty().isMongoId().withMessage('unit_id inválido'),
  body('fecha').isISO8601().withMessage('Fecha inválida (use YYYY-MM-DD)'),
  body('franja_horaria').trim().notEmpty().withMessage('La franja horaria es requerida'),
  body('num_asistentes').optional().isInt({ min: 1 }).withMessage('Mínimo 1 asistente'),
  body('descripcion').optional().trim().isLength({ max: 300 }),
];

const rechazarValidators = [
  body('motivo').trim().notEmpty().withMessage('El motivo del rechazo es requerido'),
];

// ─── Rutas de Áreas ───────────────────────────────────────────────────────────

router.get('/', ctrl.getAreas);
router.post('/', authorize('admin'), crearAreaValidators, validate, ctrl.createArea);
router.get('/:id', ctrl.getAreaById);
router.put('/:id', authorize('admin'), ctrl.updateArea);

// Estado global del área (activa / sin_servicio / mantenimiento)
router.patch('/:id/estado', authorize('admin'), estadoValidators, validate, ctrl.cambiarEstadoArea);

// Bloqueo de unidades específicas para un área
router.patch('/:id/bloquear-unidad', authorize('admin'), bloquearUnidadValidators, validate, ctrl.bloquearUnidad);
router.patch('/:id/desbloquear-unidad', authorize('admin'), bloquearUnidadValidators, validate, ctrl.desbloquearUnidad);

// ─── Rutas de Reservas (anidadas) ─────────────────────────────────────────────

// Calendario de disponibilidad: GET /areas/:id/disponibilidad?fecha=2025-08-15
router.get('/:id/disponibilidad', ctrl.getAvailability);

// Listado de reservas del área
router.get('/:id/reservas', ctrl.getBookings);

// Crear reserva (residentes y propietarios)
router.post(
  '/:id/reservas',
  authorize('admin', 'residente', 'propietario'),
  createBookingValidators,
  validate,
  ctrl.createBooking
);

// Gestión de reservas (solo admin)
router.patch('/:areaId/reservas/:reservaId/aprobar', authorize('admin'), ctrl.approveBooking);
router.patch('/:areaId/reservas/:reservaId/rechazar', authorize('admin'), rechazarValidators, validate, ctrl.rejectBooking);

// Cancelar: admin puede cancelar cualquiera; residente solo la suya (lógica en controller)
router.patch(
  '/:areaId/reservas/:reservaId/cancelar',
  authorize('admin', 'residente', 'propietario'),
  ctrl.cancelBooking
);

module.exports = router;
