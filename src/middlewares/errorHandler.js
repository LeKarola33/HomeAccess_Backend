/**
 * HomeAccess - Middleware de Manejo Centralizado de Errores
 * ==========================================================
 * Captura todos los errores lanzados con next(error) en la aplicación
 * y devuelve una respuesta estandarizada. Evita exponer detalles
 * internos del servidor en producción.
 */

/**
 * Formatea errores de validación de Mongoose en mensajes legibles.
 * @param {Object} err - Error de Mongoose
 */
const handleMongooseValidationError = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return {
    statusCode: 400,
    message: `Datos inválidos: ${errors.join('. ')}`,
  };
};

/**
 * Maneja el error de clave duplicada de MongoDB (código 11000).
 * Ocurre cuando se intenta insertar un valor que viola un índice único.
 */
const handleMongooseDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return {
    statusCode: 409,
    message: `El valor '${err.keyValue[field]}' ya existe para el campo '${field}'.`,
  };
};

/**
 * Middleware global de errores.
 * Express lo reconoce como error handler por tener 4 parámetros (err, req, res, next).
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';

  // Errores específicos de Mongoose
  if (err.name === 'ValidationError') {
    const formatted = handleMongooseValidationError(err);
    statusCode = formatted.statusCode;
    message = formatted.message;
  }

  if (err.code === 11000) {
    const formatted = handleMongooseDuplicateKey(err);
    statusCode = formatted.statusCode;
    message = formatted.message;
  }

  // Error de ObjectId inválido (ej: ID malformado en params)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `ID inválido: ${err.value}`;
  }

  // En producción, no exponer detalles del stack trace
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  // Log del error en servidor (siempre, independiente del entorno)
  if (statusCode >= 500) {
    console.error('❌ Error del servidor:', err);
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
