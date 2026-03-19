/**
 * HomeAccess - Servicio de Autenticación
 * Ruta: src/services/auth.service.js
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User   = require('../models/User.model');
const { sendPasswordResetEmail } = require('./email.service');

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

const register = async (userData) => {
  const existingUser = await User.findOne({ email: userData.email })
    .setOptions({ includeDeleted: true });
  if (existingUser) {
    const error = new Error('El email ya está registrado');
    error.statusCode = 409;
    throw error;
  }
  const user = await User.create({
    ...userData,
    password_hash: userData.password,
  });
  const { accessToken, refreshToken } = generateTokenPair(user._id, user.role);
  return { user: user.toPublicJSON(), accessToken, refreshToken };
};

const login = async (email, password) => {
  const user = await User.findOne({ email }).select('+password_hash');
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

  await User.findByIdAndUpdate(user._id, { ultimo_acceso: new Date() });
  const { accessToken, refreshToken } = generateTokenPair(user._id, user.role);
  return { user: user.toPublicJSON(), accessToken, refreshToken };
};

const refreshAccessToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.activo) {
      const err = new Error('Token inválido');
      err.statusCode = 401;
      throw err;
    }
    return generateTokenPair(user._id, user.role);
  } catch (error) {
    if (error.statusCode) throw error;
    const err = new Error('Refresh token inválido o expirado');
    err.statusCode = 401;
    throw err;
  }
};

/**
 * Solicitar recuperación de contraseña.
 * Genera un token seguro, lo guarda en el usuario y envía el email.
 */
const forgotPassword = async (email) => {
  // Siempre responder igual (evita enumeración de usuarios)
  const user = await User.findOne({ email });
  if (!user || !user.activo) return; // silencioso

  // Generar token seguro de 32 bytes
  const resetToken    = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Guardar en el usuario (expira en 30 min)
  user.reset_password_token   = resetTokenHash;
  user.reset_password_expires = Date.now() + 30 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  // Enviar email con el token en claro (no el hash)
  await sendPasswordResetEmail(
    user.email,
    user.nombres || 'Usuario',
    resetToken
  );
};

/**
 * Restablecer contraseña con el token recibido por email.
 */
const resetPassword = async (token, newPassword) => {
  // Hashear el token recibido para comparar con el guardado
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    reset_password_token:   tokenHash,
    reset_password_expires: { $gt: Date.now() },
  });

  if (!user) {
    const err = new Error('Token inválido o expirado');
    err.statusCode = 400;
    throw err;
  }

  // Actualizar contraseña (el pre-save hook la hashea)
  user.password_hash          = newPassword;
  user.reset_password_token   = undefined;
  user.reset_password_expires = undefined;
  await user.save();

  return { message: 'Contraseña actualizada correctamente' };
};

module.exports = { register, login, refreshAccessToken, forgotPassword, resetPassword };