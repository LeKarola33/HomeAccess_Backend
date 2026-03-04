/**
 * HomeAccess - Rutas de Eventos
 * ==============================
 *
 * EVENTOS:
 *   GET    /api/v1/eventos                    → listar (todos los roles)
 *   GET    /api/v1/eventos/proximos           → próximos 30 días (dashboard)
 *   GET    /api/v1/eventos/:id                → detalle
 *   POST   /api/v1/eventos                   → crear (admin)
 *   PUT    /api/v1/eventos/:id               → editar (admin, solo si 'programado')
 *   PATCH  /api/v1/eventos/:id/estado        → en_curso | finalizado (admin)
 *   PATCH  /api/v1/eventos/:id/cancelar      → cancelar con motivo (admin)
 *
 * CONFIRMACIONES (solo eventos obligatorios con requiere_confirmacion=true):
 *   POST   /api/v1/eventos/:id/confirmar     → confirmar/declinar/delegar (residente)
 *   GET    /api/v1/eventos/:id/confirmaciones → listar confirmaciones (admin)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/event.controller');
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

const createEventValidators = [
  body('titulo')
    .trim().notEmpty().withMessage('El título es requerido')
    .isLength({ max: 150 }).withMessage('Máximo 150 caracteres'),

  body('tipo')
    .isIn(['obligatorio', 'opcional'])
    .withMessage('Tipo inválido. Use: obligatorio u opcional'),

  body('fecha_inicio')
    .notEmpty().withMessage('La fecha de inicio es requerida')
    .isISO8601().withMessage('Formato inválido (use YYYY-MM-DDTHH:MM)'),

  body('fecha_fin')
    .notEmpty().withMessage('La fecha de fin es requerida')
    .isISO8601().withMessage('Formato inválido (use YYYY-MM-DDTHH:MM)'),

  body('lugar')
    .trim().notEmpty().withMessage('El lugar es requerido')
    .isLength({ max: 200 }),

  body('descripcion').optional().trim().isLength({ max: 1000 }),
  body('cupo_maximo').optional().isInt({ min: 0 }).withMessage('Cupo mínimo: 0'),
  body('requiere_confirmacion').optional().isBoolean(),
  body('fecha_limite_confirmacion').optional().isISO8601()
    .withMessage('Formato de fecha inválido'),
  body('area_comun_id').optional().isMongoId().withMessage('area_comun_id inválido'),
];

const estadoValidators = [
  body('estado')
    .isIn(['en_curso', 'finalizado'])
    .withMessage('Estado inválido. Use: en_curso o finalizado'),
];

const cancelarValidators = [
  body('motivo').trim().notEmpty().withMessage('El motivo de cancelación es obligatorio'),
];

const confirmarValidators = [
  body('unit_id')
    .notEmpty().withMessage('unit_id es requerido')
    .isMongoId().withMessage('unit_id inválido'),
  body('respuesta')
    .isIn(['confirmado', 'declinado', 'delegado'])
    .withMessage('Respuesta inválida. Use: confirmado, declinado o delegado'),
  body('delegado_nombre')
    .if(body('respuesta').equals('delegado'))
    .notEmpty().withMessage('El nombre del delegado es requerido'),
  body('justificacion').optional().trim().isLength({ max: 300 }),
];

// ─── Rutas de Eventos ─────────────────────────────────────────────────────────

// Listado general con filtros
router.get('/', ctrl.getEvents);

// Dashboard: próximos eventos (no requiere parámetros)
// IMPORTANTE: debe ir ANTES de /:id para que Express no confunda 'proximos' con un ID
router.get('/proximos', ctrl.getUpcoming);

// Detalle de un evento
router.get('/:id', ctrl.getEventById);

// Crear evento (solo admin)
router.post(
  '/',
  authorize('admin'),
  createEventValidators,
  validate,
  ctrl.createEvent
);

// Editar evento programado (solo admin)
router.put('/:id', authorize('admin'), ctrl.updateEvent);

// Cambiar estado: programado→en_curso, en_curso→finalizado (solo admin)
router.patch(
  '/:id/estado',
  authorize('admin'),
  estadoValidators,
  validate,
  ctrl.cambiarEstado
);

// Cancelar evento con motivo obligatorio (solo admin)
router.patch(
  '/:id/cancelar',
  authorize('admin'),
  cancelarValidators,
  validate,
  ctrl.cancelEvent
);

// ─── Rutas de Confirmaciones ──────────────────────────────────────────────────

// Confirmar/declinar/delegar asistencia (residente o propietario)
router.post(
  '/:id/confirmar',
  authorize('admin', 'residente', 'propietario'),
  confirmarValidators,
  validate,
  ctrl.confirmAttendance
);

// Listar todas las confirmaciones de un evento (solo admin)
router.get('/:id/confirmaciones', authorize('admin'), ctrl.getConfirmations);

module.exports = router;
