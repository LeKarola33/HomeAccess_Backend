/**
 * HomeAccess - Rutas de Autenticación
 * Ruta: src/routes/auth.routes.js
 *
 * POST /api/v1/auth/register
 * POST /api/v1/auth/login
 * POST /api/v1/auth/refresh
 * GET  /api/v1/auth/me
 * POST /api/v1/auth/forgot-password
 * POST /api/v1/auth/reset-password
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const authController = require('../controllers/auth.controller');
const { protect }    = require('../middlewares/auth.middleware');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Demasiados intentos. Espere 15 minutos.' },
});

// Rate limit más permisivo para forgot-password
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Demasiadas solicitudes. Espere 15 minutos.' },
});

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

// ── Rutas ─────────────────────────────────────────────────────

router.post('/register', authLimiter, registerValidators, validate, authController.register);
router.post('/login',    authLimiter, loginValidators,    validate, authController.login);
router.post('/refresh',  authController.refresh);
router.get('/me',        protect, authController.getMe);

// Recuperación de contraseña
router.post('/forgot-password',
  forgotLimiter,
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  validate,
  authController.forgotPassword
);

router.post('/reset-password',
  body('token').notEmpty().withMessage('Token requerido'),
  body('password')
    .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Debe tener mayúsculas, minúsculas y números'),
  validate,
  authController.resetPassword
);

module.exports = router;