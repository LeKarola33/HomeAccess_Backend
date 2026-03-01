/**
 * HomeAccess - Middleware de Autenticación y Autorización
 * ========================================================
 * protect: verifica el JWT y carga el usuario en req.user
 * authorize: verifica que el usuario tenga el rol necesario (RBAC)
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

/**
 * Middleware de autenticación.
 * Verifica que el request tenga un JWT válido en el header Authorization.
 * Si es válido, carga el usuario en req.user para los controllers.
 */
const protect = async (req, res, next) => {
  let token;

  // Extraer token del header: "Authorization: Bearer <token>"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No autorizado. Token no proporcionado.',
    });
  }

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cargar el usuario desde la BD para verificar que sigue activo
    // y obtener su rol actualizado (no el del token que podría estar desactualizado)
    const user = await User.findById(decoded.id).select('-password_hash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado. El usuario ya no existe.',
      });
    }

    if (!user.activo) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado. Cuenta desactivada.',
      });
    }

    // Adjuntar usuario al request para uso en controllers
    req.user = user;
    next();

  } catch (error) {
    // jwt.verify lanza errores específicos
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Por favor inicie sesión nuevamente.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'No autorizado. Token inválido.',
    });
  }
};

/**
 * Middleware de autorización RBAC (Role-Based Access Control).
 * Debe usarse DESPUÉS de protect.
 *
 * @param  {...string} roles - Roles permitidos para acceder a la ruta
 * @example router.get('/admin', protect, authorize('admin'), controller)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
      });
    }
    next();
  };
};

/**
 * Middleware para verificar que el usuario solo accede a sus propios datos
 * (o que es admin). Útil para rutas como GET /users/:id.
 */
const isSelfOrAdmin = (req, res, next) => {
  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user._id.toString() === req.params.id;

  if (!isAdmin && !isSelf) {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado. Solo puede acceder a sus propios datos.',
    });
  }
  next();
};

module.exports = { protect, authorize, isSelfOrAdmin };
