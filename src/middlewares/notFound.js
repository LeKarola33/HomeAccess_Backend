/**
 * HomeAccess - Middleware de Rutas No Encontradas (404)
 * =====================================================
 * Se ejecuta cuando ninguna ruta coincide con la petición.
 */

const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = notFound;
