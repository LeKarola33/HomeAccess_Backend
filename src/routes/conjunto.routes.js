/**
 * HomeAccess - Rutas de Conjuntos Residenciales
 * ===============================================
 * GET  /api/v1/conjuntos/:id   → detalle del conjunto propio (admin)
 * PUT  /api/v1/conjuntos/:id   → actualizar datos del conjunto (admin)
 *
 * NOTA DE DISEÑO:
 *   - No existe POST (crear conjunto): los conjuntos se crean vía seed o
 *     por un superadmin futuro. No se expone en la API pública del MVP.
 *   - No existe DELETE en la API: el soft-delete se gestiona internamente.
 *   - Cada admin solo puede ver y editar SU propio conjunto (multitenant).
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const conjuntoController = require('../controllers/conjunto.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas de conjuntos requieren autenticación
router.use(protect);

// ─── Validador de errores (mismo patrón que access.routes.js) ─────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ─── Validadores para PUT ──────────────────────────────────────────────────────
/**
 * Solo se validan los campos que el admin puede modificar.
 * NIT y email_admin NO están aquí: son campos de identidad que no
 * se pueden cambiar desde la API (requieren proceso administrativo).
 */
const updateConjuntoValidators = [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage('El nombre debe tener entre 3 y 120 caracteres'),

  body('direccion')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('La dirección no puede estar vacía'),

  body('ciudad')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('La ciudad no puede estar vacía'),

  body('telefono')
    .optional()
    .trim(),

  body('total_unidades')
    .optional()
    .isInt({ min: 0 })
    .withMessage('total_unidades debe ser un número entero positivo'),

  body('porterias')
    .optional()
    .isArray({ min: 1 })
    .withMessage('porterias debe ser un arreglo con al menos un elemento'),

  body('plan')
    .optional()
    .isIn(['basico', 'estandar', 'premium'])
    .withMessage('Plan inválido. Use: basico, estandar o premium'),
];

// ─── Rutas ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/conjuntos/me
 * Retorna el conjunto al que pertenece el admin autenticado.
 * Alias conveniente para el frontend: no necesita conocer el ID del conjunto.
 */
router.get('/me', authorize('admin'), conjuntoController.getMyConjunto);

/**
 * GET /api/v1/conjuntos/:id
 * Detalle de un conjunto específico.
 * El admin solo puede consultar su propio conjunto (validación en controller).
 */
router.get('/:id', authorize('admin'), conjuntoController.getConjuntoById);

/**
 * PUT /api/v1/conjuntos/:id
 * Actualiza datos del conjunto.
 * Campos protegidos (nit, email_admin) se ignoran en el controller.
 */
router.put(
  '/:id',
  authorize('admin'),
  updateConjuntoValidators,
  validate,
  conjuntoController.updateConjunto
);

module.exports = router;
