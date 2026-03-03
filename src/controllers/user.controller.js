/**
 * HomeAccess - Controlador de Usuarios
 * ======================================
 * CRUD de usuarios con paginación y filtros.
 */

const User = require('../models/User.model');

/**
 * POST /api/v1/users/create
 * Crea un nuevo usuario desde el panel de administración.
 * Solo accesible por admin. Registra el consentimiento automáticamente
 * (el admin declara haber obtenido autorización del titular - Ley 1581).
 */
const createUser = async (req, res, next) => {
  try {
    const { password, confirmPassword, ...userData } = req.body;

    // Verificar que el email no esté ya registrado
    const existing = await User.findOne({ email: userData.email })
      .setOptions({ includeDeleted: true });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'El email ya está registrado en el sistema',
      });
    }

    const user = await User.create({
      ...userData,
      password_hash: password,              // Pre-save hook hashea la contraseña
      conjunto_id: req.user.conjunto_id,    // Heredar el conjunto del admin
      consent: {
        dado: true,
        fecha: new Date(),
        version: '1.0',
        canal: 'presencial',                // Registrado por el administrador
        ip: req.ip,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: user.toPublicJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/users
 * Lista usuarios del conjunto con paginación y filtros.
 * Solo accesible por admin.
 */
const getUsers = async (req, res, next) => {
  try {
    // Paginación estandarizada: ?page=1&limit=20&sort=createdAt:desc
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // Ordenamiento: "campo:desc" o "campo:asc"
    const [sortField, sortOrder] = (req.query.sort || 'createdAt:desc').split(':');
    const sort = { [sortField]: sortOrder === 'desc' ? -1 : 1 };

    // Filtros opcionales
    const filter = { conjunto_id: req.user.conjunto_id };
    if (req.query.role) filter.role = req.query.role;
    if (req.query.activo !== undefined) filter.activo = req.query.activo === 'true';

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/users/:id
 * Obtiene un usuario por ID.
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('unidades', 'numero torre piso')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/users/:id
 * Actualiza datos de un usuario. Solo admin o el propio usuario.
 */
const updateUser = async (req, res, next) => {
  try {
    // Campos que NO se pueden actualizar por esta ruta (seguridad)
    const restricted = ['password_hash', 'role', 'conjunto_id', 'deletedAt'];
    restricted.forEach((field) => delete req.body[field]);

    // Solo admin puede cambiar el rol
    if (req.body.role && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Sin permisos para cambiar el rol' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.status(200).json({ success: true, data: user.toPublicJSON(), message: 'Usuario actualizado' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/users/:id
 * Soft delete: marca el usuario como eliminado sin borrar el registro.
 * Obligatorio para cumplir con Ley 1581 (retención de datos).
 * Solo admin puede realizar esta acción.
 */
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { activo: false }, // ✅ SOLO desactivar
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Usuario desactivado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createUser, getUsers, getUserById, updateUser, deleteUser };
