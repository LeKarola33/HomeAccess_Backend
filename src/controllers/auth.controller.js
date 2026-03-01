/**
 * HomeAccess - Controlador de Autenticación
 * ==========================================
 * Recibe las peticiones HTTP, delega la lógica al servicio y
 * devuelve respuestas estandarizadas.
 *
 * Formato de respuesta estándar:
 * { success: boolean, data: any, message: string }
 */

const authService = require('../services/auth.service');

/**
 * POST /api/v1/auth/register
 * Registra un nuevo usuario en el sistema.
 */
const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    next(error); // Delega al middleware errorHandler
  }
};

/**
 * POST /api/v1/auth/login
 * Autentica al usuario y retorna los tokens JWT.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/refresh
 * Renueva el access token usando el refresh token.
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token requerido',
      });
    }

    const tokens = await authService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token renovado exitosamente',
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/auth/me
 * Retorna los datos del usuario autenticado (requiere token válido).
 * El usuario ya viene cargado en req.user por el middleware protect.
 */
const getMe = (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: req.user },
  });
};

module.exports = { register, login, refresh, getMe };
