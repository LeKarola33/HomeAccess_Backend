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
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const unitRoutes = require('./routes/unit.routes');
const conjuntoRoutes = require('./routes/conjunto.routes');
const accessRoutes = require('./routes/access.routes');
const packageRoutes = require('./routes/package.routes');
const complexRoutes    = require('./routes/complex.routes');
const commonAreaRoutes = require('./routes/commonArea.routes');
const eventRoutes      = require('./routes/event.routes');
const parkingRoutes    = require('./routes/parking.routes');
const vehicleRoutes = require('./routes/vehicle.routes')


// Middleware de manejo centralizado de errores
const errorHandler = require('./middlewares/errorHandler');
const notFound = require('./middlewares/notFound');

const app = express();

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
  credentials: true, // permite envío de cookies/tokens
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

/**
 * Rate Limiting global: protege contra ataques de fuerza bruta y DDoS
 * Configuración más estricta para rutas de autenticación (ver auth.routes.js)
 */
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Intente de nuevo más tarde.' },
});
app.use('/api', globalLimiter);

// ==========================================
// MIDDLEWARES DE PARSEO Y LOGGING
// ==========================================
app.use(express.json({ limit: '10kb' })); // Limita el tamaño del body para prevenir DoS
app.use(express.urlencoded({ extended: true }));

// Morgan: logs HTTP (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ==========================================
// RUTAS DE LA API - v1
// ==========================================
// Todas las rutas llevan el prefijo /api/v1 para versionado

app.use('/api/v1/auth', authRoutes);           // Registro, login, refresh token
app.use('/api/v1/users', userRoutes);          // CRUD de usuarios
app.use('/api/v1/units', unitRoutes);          // CRUD de unidades residenciales
app.use('/api/v1/conjuntos', conjuntoRoutes);  // CRUD de conjuntos residenciales
app.use('/api/v1/access-logs', accessRoutes);  // Control de acceso portería
app.use('/api/v1/packages', packageRoutes);    // Paquetes y correspondencia
app.use('/api/v1/complexes', complexRoutes);//
app.use('/api/v1/common-areas', commonAreaRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/parking', parkingRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);//vehiculos


// Health check endpoint (usado por Docker, balanceadores de carga, etc.)
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, status: 'OK', timestamp: new Date().toISOString() });
});

// ==========================================
// MANEJO DE ERRORES (siempre al final)
// ==========================================
app.use(notFound);     // Rutas no encontradas -> 404
app.use(errorHandler); // Errores globales -> respuesta estandarizada

module.exports = app;
