/**
 * HomeAccess - Vehicle Controller
 * =================================
 * CRUD de vehículos del conjunto residencial.
 *
 * TIPOS SOPORTADOS:
 *   carro, moto            → placa obligatoria (formato colombiano ABC123)
 *   bicicleta, patineta, otro → placa opcional
 *
 * LÓGICA DE NEGOCIO:
 *   - Al registrar un vehículo se agrega su _id al array Unit.vehiculos[]
 *     para mantener consistencia bidireccional.
 *   - Al eliminar (soft delete) se remueve de Unit.vehiculos[] y se libera
 *     el puesto de parqueadero si tenía uno asignado.
 *   - La placa es inmutable después de ser registrada.
 *   - Multitenant: todos los queries filtran por conjunto_id del usuario.
 */

const Vehicle = require('../models/Vehicle.model');
const Unit    = require('../models/Unit.model');

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/vehicles
 * Lista vehículos del conjunto con paginación.
 *
 * Roles:
 *   admin / portero / vigilante → ven todos los vehículos
 *   residente / propietario     → solo ven los de su(s) unidad(es)
 *
 * Filtros opcionales:
 *   ?tipo=carro|moto|bicicleta|patineta|otro
 *   ?placa=ABC          búsqueda parcial, insensible a mayúsculas
 *   ?unit_id=<id>       vehículos de una unidad específica
 *   ?con_puesto=true    solo vehículos con puesto asignado
 *   ?sin_puesto=true    solo vehículos sin puesto asignado
 *   ?page=1&limit=20
 */
const getVehicles = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id, activo: true };

    // Residentes y propietarios solo ven sus vehículos
    if (!['admin', 'portero', 'vigilante'].includes(req.user.role)) {
      filter.unit_id = { $in: req.user.unidades };
    }

    // Filtros opcionales
    if (req.query.unit_id)    filter.unit_id = req.query.unit_id;
    if (req.query.tipo)       filter.tipo    = req.query.tipo;
    if (req.query.placa)      filter.placa   = new RegExp(req.query.placa.toUpperCase(), 'i');
    if (req.query.con_puesto  === 'true') filter.parqueadero_id = { $ne: null };
    if (req.query.sin_puesto  === 'true') filter.parqueadero_id = null;

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('unit_id',        'numero torre piso')
        .populate('propietario_id', 'nombres apellidos celular')
        .populate('parqueadero_id', 'numero estado')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Vehicle.countDocuments(filter),
    ]);

    // Resumen por tipo para el dashboard
    const resumen = await Vehicle.aggregate([
      { $match: { conjunto_id: req.user.conjunto_id, activo: true } },
      { $group: { _id: '$tipo', total: { $sum: 1 } } },
    ]);

    const porTipo = resumen.reduce((acc, r) => {
      acc[r._id] = r.total;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: vehicles,
      resumen: porTipo,
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
 * GET /api/v1/vehicles/:id
 * Detalle completo de un vehículo.
 */
const getVehicleById = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    })
      .populate('unit_id',        'numero torre piso')
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'numero estado')
      .lean();

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    res.status(200).json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/vehicles
 * Registra un nuevo vehículo y lo vincula a su unidad.
 * Admin only.
 *
 * Body requerido:
 *   unit_id, propietario_id, tipo
 *   placa (obligatorio si tipo = carro | moto)
 *
 * Body opcional:
 *   marca, modelo, color, anio
 *   placa (para bicicleta, patineta, otro)
 */
const createVehicle = async (req, res, next) => {
  try {
    const {
      unit_id, propietario_id, placa,
      tipo, marca, modelo, color, anio,
    } = req.body;

    // Verificar que la unidad existe y pertenece al conjunto
    const unit = await Unit.findOne({
      _id:         unit_id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    // Placa obligatoria para carro y moto
    const requiresPlate = ['carro', 'moto'].includes(tipo);
    if (requiresPlate && !placa) {
      return res.status(400).json({
        success: false,
        message: `La placa es obligatoria para vehículos de tipo '${tipo}'`,
      });
    }

    // Verificar placa duplicada dentro del conjunto (si viene placa)
    if (placa) {
      const existing = await Vehicle.findOne({
        placa:       placa.toUpperCase(),
        conjunto_id: req.user.conjunto_id,
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `La placa ${placa.toUpperCase()} ya está registrada en este conjunto`,
        });
      }
    }

    const vehicle = await Vehicle.create({
      conjunto_id: req.user.conjunto_id,
      unit_id,
      propietario_id,
      placa:  placa ? placa.toUpperCase() : null,
      tipo,
      marca,
      modelo,
      color,
      anio,
    });

    // Consistencia bidireccional: agregar a Unit.vehiculos[]
    await Unit.findByIdAndUpdate(unit_id, {
      $addToSet: { vehiculos: vehicle._id },
    });

    const populated = await vehicle.populate([
      { path: 'unit_id',        select: 'numero torre' },
      { path: 'propietario_id', select: 'nombres apellidos' },
    ]);

    res.status(201).json({
      success: true,
      data: populated,
      message: `Vehículo ${vehicle.placa || tipo} registrado exitosamente`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALIZAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/v1/vehicles/:id
 * Actualiza datos del vehículo.
 * Campos inmutables: placa, conjunto_id, parqueadero_id.
 * Admin only.
 */
const updateVehicle = async (req, res, next) => {
  try {
    // Campos que no se pueden modificar
    ['placa', 'conjunto_id', 'parqueadero_id', 'deletedAt', 'activo'].forEach(
      (f) => delete req.body[f]
    );

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      req.body,
      { new: true, runValidators: true }
    )
      .populate('unit_id',        'numero torre')
      .populate('propietario_id', 'nombres apellidos')
      .populate('parqueadero_id', 'numero');

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    res.status(200).json({
      success: true,
      data: vehicle,
      message: 'Vehículo actualizado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/v1/vehicles/:id
 * Soft delete del vehículo.
 * - Libera el puesto de parqueadero si tenía uno asignado.
 * - Remueve el _id de Unit.vehiculos[].
 * Admin only.
 */
const deleteVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    // Liberar puesto si tenía uno asignado
    if (vehicle.parqueadero_id) {
      await Unit.findByIdAndUpdate(vehicle.parqueadero_id, { estado: 'desocupado' });
    }

    // Soft delete
    await Vehicle.findByIdAndUpdate(req.params.id, {
      activo:         false,
      deletedAt:      new Date(),
      parqueadero_id: null,
    });

    // Remover de Unit.vehiculos[]
    await Unit.findByIdAndUpdate(vehicle.unit_id, {
      $pull: { vehiculos: vehicle._id },
    });

    res.status(200).json({
      success: true,
      message: `Vehículo ${vehicle.placa || vehicle.tipo} eliminado del registro`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTAS ADICIONALES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/vehicles/unit/:unitId
 * Lista todos los vehículos de una unidad residencial específica.
 * Útil en la vista de detalle del apartamento.
 */
const getVehiclesByUnit = async (req, res, next) => {
  try {
    const unit = await Unit.findOne({
      _id:         req.params.unitId,
      conjunto_id: req.user.conjunto_id,
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    const vehicles = await Vehicle.find({
      unit_id: req.params.unitId,
      activo:  true,
    })
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'numero estado')
      .lean();

    res.status(200).json({
      success: true,
      unit:           { numero: unit.numero, torre: unit.torre },
      total_vehicles: vehicles.length,
      data:           vehicles,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehiclesByUnit,
};
