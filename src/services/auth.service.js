/**
 * HomeAccess - Servicio de Autenticación
 * =======================================
 * Lógica de negocio para registro, login y refresh de tokens.
 * Los controllers solo llaman a estos métodos; la lógica vive aquí.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

/**
 * Genera un par de tokens JWT (access + refresh).
 * @param {string} userId - ID del usuario
 * @param {string} role - Rol del usuario
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateTokenPair = (userId, role) => {
  const payload = { id: userId, role };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
};

/**
 * Registra un nuevo usuario en el sistema.
 * @param {Object} userData - Datos del nuevo usuario
 * @returns {Promise<{ user: Object, accessToken: string, refreshToken: string }>}
 */
const register = async (userData) => {
  // Verificar si el email ya existe
  const existingUser = await User.findOne({ email: userData.email }).setOptions({ includeDeleted: true });
  if (existingUser) {
    const error = new Error('El email ya está registrado');
    error.statusCode = 409;
    throw error;
  }

  // Crear usuario (el password se hashea en el pre-save hook del modelo)
  const user = await User.create({
    ...userData,
    password_hash: userData.password, // El hook pre-save lo hashea
  });

  const { accessToken, refreshToken } = generateTokenPair(user._id, user.role);

  return {
    user: user.toPublicJSON(),
    accessToken,
    refreshToken,
  };
};

/**
 * Autentica un usuario con email y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: Object, accessToken: string, refreshToken: string }>}
 */
const login = async (email, password) => {
  // Buscar usuario incluyendo el password_hash (select: false por defecto)
  const user = await User.findOne({ email }).select('+password_hash');

  // Mismo mensaje de error para email no encontrado y contraseña incorrecta
  // (evita enumeración de usuarios)
  const invalidCredentialsError = new Error('Credenciales inválidas');
  invalidCredentialsError.statusCode = 401;

  if (!user) throw invalidCredentialsError;
  if (!user.activo) {
    const err = new Error('Cuenta desactivada. Contacte al administrador.');
    err.statusCode = 403;
    throw err;
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) throw invalidCredentialsError;

  // Actualizar último acceso
  await User.findByIdAndUpdate(user._id, { ultimo_acceso: new Date() });

  const { accessToken, refreshToken } = generateTokenPair(user._id, user.role);

  return {
    user: user.toPublicJSON(),
    accessToken,
    refreshToken,
  };
};

/**
 * Renueva el access token usando el refresh token.
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Verificar que el usuario sigue activo
    const user = await User.findById(decoded.id);
    if (!user || !user.activo) {
      const err = new Error('Token inválido');
      err.statusCode = 401;
      throw err;
    }

    const tokens = generateTokenPair(user._id, user.role);
    return tokens;

  } catch (error) {
    if (error.statusCode) throw error;
    const err = new Error('Refresh token inválido o expirado');
    err.statusCode = 401;
    throw err;
  }
};

module.exports = { register, login, refreshAccessToken };
