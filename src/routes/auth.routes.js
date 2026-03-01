/**
 * HomeAccess - Rutas de Autenticación
 * =====================================
 * POST /api/v1/auth/register
 * POST /api/v1/auth/login
 * POST /api/v1/auth/refresh
 * GET  /api/v1/auth/me  (protegida)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Rate limit estricto para autenticación (previene brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // Máximo 10 intentos de login en 15 min
  message: { success: false, message: 'Demasiados intentos. Espere 15 minutos.' },
});

// ==========================================
// VALIDADORES (express-validator)
// ==========================================

/**
 * Middleware que verifica los errores de validación y retorna 400 si hay alguno.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Datos de entrada inválidos',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const registerValidators = [
  body('nombres').trim().notEmpty().withMessage('Nombres requeridos').isLength({ min: 2, max: 80 }),
  body('apellidos').trim().notEmpty().withMessage('Apellidos requeridos').isLength({ min: 2, max: 80 }),
  body('cedula').trim().notEmpty().withMessage('Cédula requerida'),
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener mínimo 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe tener mayúsculas, minúsculas y números'),
];

const loginValidators = [
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

// ==========================================
// RUTAS
// ==========================================

// Registro de nuevo usuario
router.post('/register', authLimiter, registerValidators, validate, authController.register);

// Login
router.post('/login', authLimiter, loginValidators, validate, authController.login);

// Renovar access token con refresh token
router.post('/refresh', authController.refresh);

// Obtener datos del usuario autenticado (requiere token válido)
router.get('/me', protect, authController.getMe);

module.exports = router;
