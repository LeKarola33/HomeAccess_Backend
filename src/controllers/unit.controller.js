/**
 * HomeAccess - Unit Controller
 * ==============================
 * CRUD completo de unidades residenciales.
 *
 * TIPOS: apartamento, casa, local, bodega, parqueadero
 * ESTADOS: desocupado, ocupado, en_mantenimiento, en_venta
 *
 * LÓGICA:
 *   - numero+conjunto_id es único (índice)
 *   - Al asignar propietario_actual se agrega al historial_propietarios
 *   - DELETE es soft delete: no borra del DB, marca deletedAt
 *   - Multitenant: todos los queries filtran por conjunto_id
 */

const Unit = require('../models/Unit.model');

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/units
 * Filtros: ?estado= ?tipo= ?torre= ?page= ?limit=
 */
const getUnits = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id };
    if (req.query.estado) filter.estado = req.query.estado;
    if (req.query.tipo)   filter.tipo   = req.query.tipo;
    if (req.query.torre)  filter.torre  = new RegExp(req.query.torre, 'i');

    const [units, total] = await Promise.all([
      Unit.find(filter)
        .populate('propietario_actual', 'nombres apellidos celular email')
        .populate('residentes',         'nombres apellidos')
        .sort({ torre: 1, numero: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Unit.countDocuments(filter),
    ]);

    // Resumen por estado
    const resumen = await Unit.aggregate([
      { $match: { conjunto_id: req.user.conjunto_id } },
      { $group: { _id: '$estado', total: { $sum: 1 } } },
    ]);
    const porEstado = resumen.reduce((acc, r) => { acc[r._id] = r.total; return acc; }, {});

    res.status(200).json({
      success: true,
      data: units,
      resumen: porEstado,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/units/:id
 */
const getUnitById = async (req, res, next) => {
  try {
    const unit = await Unit.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    })
      .populate('propietario_actual',          'nombres apellidos email celular')
      .populate('residentes',                  'nombres apellidos celular')
      .populate('vehiculos',                   'placa tipo marca modelo color')
      .populate('historial_propietarios.user_id', 'nombres apellidos')
      .lean();

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    res.status(200).json({ success: true, data: unit });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/units
 * Admin only.
 * Body: numero*, tipo, torre, piso, estado, propietario_actual?
 */
const createUnit = async (req, res, next) => {
  try {
    const {
      numero, tipo, torre, piso, estado,
      propietario_actual,
    } = req.body;

    // Verificar duplicado numero+conjunto
    const existing = await Unit.findOne({
      numero:      numero?.trim(),
      conjunto_id: req.user.conjunto_id,
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Ya existe una unidad con número "${numero}" en este conjunto`,
      });
    }

    const unitData = {
      conjunto_id: req.user.conjunto_id,
      numero:      numero?.trim(),
      tipo:        tipo    || 'apartamento',
      estado:      estado  || 'desocupado',
      torre:       torre   || null,
      piso:        piso    || null,
    };

    // Si viene propietario, registrar en historial
    if (propietario_actual) {
      unitData.propietario_actual = propietario_actual;
      unitData.historial_propietarios = [{
        user_id:      propietario_actual,
        fecha_inicio: new Date(),
      }];
      unitData.estado = 'ocupado';
    }

    const unit = await Unit.create(unitData);

    const populated = await unit.populate(
      'propietario_actual', 'nombres apellidos'
    );

    res.status(201).json({
      success: true,
      data:    populated,
      message: `Unidad ${unit.numero} creada exitosamente`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALIZAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/v1/units/:id
 * Admin only.
 * Al cambiar propietario_actual cierra el historial anterior y abre uno nuevo.
 */
const updateUnit = async (req, res, next) => {
  try {
    // Campos inmutables
    ['conjunto_id', 'vehiculos', 'historial_propietarios'].forEach(
      (f) => delete req.body[f]
    );

    const unit = await Unit.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    const newPropietario = req.body.propietario_actual;

    // Cambio de propietario → cerrar historial anterior y abrir nuevo
    if (newPropietario && String(newPropietario) !== String(unit.propietario_actual)) {
      // Cerrar registro anterior
      const lastIdx = unit.historial_propietarios.findLastIndex((h) => !h.fecha_fin);
      if (lastIdx >= 0) {
        unit.historial_propietarios[lastIdx].fecha_fin = new Date();
      }
      // Abrir nuevo registro
      unit.historial_propietarios.push({
        user_id:      newPropietario,
        fecha_inicio: new Date(),
      });
    }

    Object.assign(unit, req.body);
    await unit.save();

    const populated = await Unit.findById(unit._id)
      .populate('propietario_actual', 'nombres apellidos celular')
      .populate('residentes',         'nombres apellidos');

    res.status(200).json({
      success: true,
      data:    populated,
      message: 'Unidad actualizada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/v1/units/:id
 * Admin only. Soft delete.
 * No se puede eliminar si tiene vehículos activos o residentes asignados.
 */
const deleteUnit = async (req, res, next) => {
  try {
    const unit = await Unit.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    if (unit.vehiculos?.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar: la unidad tiene vehículos registrados. Elimínalos primero.',
      });
    }

    if (unit.residentes?.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar: la unidad tiene residentes asignados.',
      });
    }

    await Unit.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });

    res.status(200).json({
      success: true,
      message: `Unidad ${unit.numero} eliminada`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MASCOTAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/units/:id/mascotas
 * Agrega una mascota a la unidad.
 */
const addMascota = async (req, res, next) => {
  try {
    const { nombre, especie, raza } = req.body;

    if (!nombre || !especie) {
      return res.status(400).json({
        success: false,
        message: 'nombre y especie son requeridos',
      });
    }

    const unit = await Unit.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      { $push: { mascotas: { nombre, especie, raza: raza || null } } },
      { new: true }
    );

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    res.status(200).json({
      success: true,
      data:    unit.mascotas,
      message: `Mascota "${nombre}" registrada`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/units/:id/mascotas/:mascotaId
 * Elimina una mascota de la unidad.
 */
const removeMascota = async (req, res, next) => {
  try {
    const unit = await Unit.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      { $pull: { mascotas: { _id: req.params.mascotaId } } },
      { new: true }
    );

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    res.status(200).json({
      success: true,
      data:    unit.mascotas,
      message: 'Mascota eliminada',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
  addMascota,
  removeMascota,
};
