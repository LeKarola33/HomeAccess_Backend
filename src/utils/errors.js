/**
 * HomeAccess - Utilidades de Respuesta
 * =====================================
 * Funciones helper para crear un error con statusCode
 * y lanzarlo hacia el middleware errorHandler.
 */

/**
 * Crea un error con statusCode personalizado.
 * @param {string} message - Mensaje del error
 * @param {number} statusCode - Código HTTP (default 500)
 */
const createError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

module.exports = { createError };
