/**
 * HomeAccess - Controlador de Autenticación
 * Ruta: src/controllers/auth.controller.js
 */

const authService = require('../services/auth.service');

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user:         result.user,
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) { next(error); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user:         result.user,
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) { next(error); }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token requerido' });
    }
    const tokens = await authService.refreshAccessToken(refreshToken);
    res.status(200).json({ success: true, message: 'Token renovado', data: tokens });
  } catch (error) { next(error); }
};

const getMe = (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};

const forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({
      success: true,
      message: 'Si el correo está registrado, recibirás un enlace en los próximos minutos.',
    });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

module.exports = { register, login, refresh, getMe, forgotPassword, resetPassword };