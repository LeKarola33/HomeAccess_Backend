/**
 * HomeAccess - Configuración de la aplicación Express
 * ====================================================
 * Configura middlewares globales, rutas y manejo de errores.
 * Separado de server.js para facilitar los tests (supertest).
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Rutas del MVP
const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const unitRoutes         = require('./routes/unit.routes');
const conjuntoRoutes     = require('./routes/conjunto.routes');
const accessRoutes       = require('./routes/access.routes');
const packageRoutes      = require('./routes/package.routes');
const complexRoutes      = require('./routes/complex.routes');
const commonAreaRoutes   = require('./routes/commonArea.routes');
const eventRoutes        = require('./routes/event.routes');
const parkingRoutes      = require('./routes/parking.routes');
const vehicleRoutes      = require('./routes/vehicle.routes');
const securityGuardRoutes = require('./routes/securityguard.routes'); // ← NUEVO
const residentRoutes = require('./routes/resident.routes');


// Middleware de manejo centralizado de errores
const errorHandler = require('./middlewares/errorHandler');
const notFound     = require('./middlewares/notFound');

const app = express();
app.set('trust proxy', 1);
// ==========================================
// MIDDLEWARES DE SEGURIDAD
// ==========================================

/**
 * Helmet: configura headers HTTP de seguridad
 * Previene XSS, clickjacking, sniffing de MIME, etc.
 */
app.use(helmet());

/**
 * CORS: solo permite peticiones desde el origen autorizado
 * En producción, CORS_ORIGIN debe ser el dominio del frontend
 */
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

/**
 * Rate Limiting global: protege contra ataques de fuerza bruta y DDoS
 */
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Intente de nuevo más tarde.' },
});
app.use('/api', globalLimiter);

// ==========================================
// MIDDLEWARES DE PARSEO Y LOGGING
// ==========================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ==========================================
// RUTAS DE LA API - v1
// ==========================================

app.use('/api/v1/auth',            authRoutes);
app.use('/api/v1/users',           userRoutes);
app.use('/api/v1/units',           unitRoutes);
app.use('/api/v1/conjuntos',       conjuntoRoutes);
app.use('/api/v1/access-logs',     accessRoutes);
app.use('/api/v1/packages',        packageRoutes);
app.use('/api/v1/complexes',       complexRoutes);
app.use('/api/v1/common-areas',    commonAreaRoutes);
app.use('/api/v1/events',          eventRoutes);
app.use('/api/v1/parking',         parkingRoutes);
app.use('/api/v1/vehicles',        vehicleRoutes);
app.use('/api/v1/securityguard',   securityGuardRoutes); // ← NUEVO
app.use('/api/v1/resident', residentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, status: 'OK', timestamp: new Date().toISOString() });
});

// ==========================================
// MANEJO DE ERRORES (siempre al final)
// ==========================================
app.use(notFound);
app.use(errorHandler);

module.exports = app;