/**
 * HomeAccess - Controlador de Usuarios
 * ======================================
 * CRUD de usuarios con paginación y filtros.
 */

const User = require('../models/User.model');

const createUser = async (req, res, next) => {
  try {
    const { password, confirmPassword, ...userData } = req.body;

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
      password_hash: password,
      conjunto_id: req.user.conjunto_id,
      consent: {
        dado: true,
        fecha: new Date(),
        version: '1.0',
        canal: 'presencial',
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

const getUsers = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [sortField, sortOrder] = (req.query.sort || 'createdAt:desc').split(':');
    const sort = { [sortField]: sortOrder === 'desc' ? -1 : 1 };

    const filter = { conjunto_id: req.user.conjunto_id };
    if (req.query.role)   filter.role   = req.query.role;
    if (req.query.activo !== undefined) filter.activo = req.query.activo === 'true';

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

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

const updateUser = async (req, res, next) => {
  try {
    const restricted = ['password_hash', 'conjunto_id', 'deletedAt'];
    restricted.forEach((field) => delete req.body[field]);

    if (req.body.role && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Sin permisos para cambiar el rol' });
    }

    const { ninos, mascotas, ...rest } = req.body;

    // ── DEBUG: ver qué llega al backend ──────────────────────────
    console.log('══ updateUser DEBUG ══');
    console.log('ID:', req.params.id);
    console.log('ninos recibidos:', JSON.stringify(ninos));
    console.log('mascotas recibidas:', JSON.stringify(mascotas));
    console.log('rest keys:', Object.keys(rest));
    // ─────────────────────────────────────────────────────────────

    const updatePayload = {
      $set: {
        ...rest,
        updatedAt: new Date(),
        ...(ninos    !== undefined && { ninos }),
        ...(mascotas !== undefined && { mascotas }),
      },
    };

    console.log('updatePayload.$set.ninos:', JSON.stringify(updatePayload.$set.ninos));

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    console.log('user.ninos después de guardar:', JSON.stringify(user.ninos));

    res.status(200).json({
      success: true,
      data: user.toPublicJSON(),
      message: 'Usuario actualizado',
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.status(200).json({ success: true, message: 'Usuario desactivado exitosamente' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createUser, getUsers, getUserById, updateUser, deleteUser };
