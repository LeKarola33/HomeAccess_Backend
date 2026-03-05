/**
 * HomeAccess - Parking Controller
 * =================================
 * Manages registered vehicles and parking spot assignment.
 *
 * BUSINESS LOGIC:
 *   - A "parking spot" is a Unit with tipo='parqueadero'.
 *     This reuses the existing model and its pagination/filter logic.
 *   - When registering a vehicle, its _id is added to Unit.vehiculos[].
 *   - When assigning a spot: the Unit changes estado to 'ocupado'
 *     and Vehicle.parqueadero_id is set.
 *   - When unassigning: the Unit returns to 'desocupado' and parqueadero_id=null.
 *   - A spot can only have ONE vehicle at a time.
 */

const Vehicle = require('../models/Vehicle.model');
const Unit    = require('../models/Unit.model');

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/parking/vehicles
 * Lists all vehicles in the complex with pagination.
 * Admin/security: all | Resident: only their unit's vehicles.
 * Optional filters: ?unit_id=  ?tipo=carro  ?placa=ABC  ?page=1  ?limit=20
 */
const getVehicles = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id, activo: true };

    // Residents and owners only see vehicles from their own unit
    if (!['admin', 'portero', 'vigilante'].includes(req.user.role)) {
      filter.unit_id = { $in: req.user.unidades };
    }

    if (req.query.unit_id) filter.unit_id = req.query.unit_id;
    if (req.query.tipo)    filter.tipo    = req.query.tipo;
    if (req.query.placa)   filter.placa   = new RegExp(req.query.placa.toUpperCase(), 'i');

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

    res.status(200).json({
      success: true,
      data: vehicles,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/parking/vehicles/:id
 * Returns details of a specific vehicle.
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
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    res.status(200).json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/parking/vehicles
 * Registers a new vehicle and links it to its unit.
 * Also updates Unit.vehiculos[] to maintain bidirectional reference.
 * Admin only.
 */
const createVehicle = async (req, res, next) => {
  try {
    const { unit_id, propietario_id, placa, tipo, marca, modelo, color, anio } = req.body;

    const unit = await Unit.findOne({ _id: unit_id, conjunto_id: req.user.conjunto_id });
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    // Plate required for cars and motorcycles, optional for bikes/scooters/other
    const requiresPlate = ['carro', 'moto'].includes(tipo);
    if (requiresPlate && !placa) {
      return res.status(400).json({
        success: false,
        message: `La placa es obligatoria para vehículos de tipo '${tipo}'`,
      });
    }

    const vehicle = await Vehicle.create({
      conjunto_id: req.user.conjunto_id,
      unit_id,
      propietario_id,
      placa,
      tipo,
      marca,
      modelo,
      color,
      anio,
    });

    // Maintain bidirectionality
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
      message: `Vehicle ${vehicle.placa} registered successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/parking/vehicles/:id
 * Updates vehicle data. Plate and complex are immutable.
 * Admin only.
 */
const updateVehicle = async (req, res, next) => {
  try {
    const restricted = ['placa', 'conjunto_id', 'parqueadero_id', 'deletedAt'];
    restricted.forEach((f) => delete req.body[f]);

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      req.body,
      { new: true, runValidators: true }
    )
      .populate('unit_id',        'numero torre')
      .populate('parqueadero_id', 'numero');

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    res.status(200).json({ success: true, data: vehicle, message: 'Vehicle updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/parking/vehicles/:id
 * Soft deletes a vehicle. Frees the spot if one was assigned.
 * Also removes _id from Unit.vehiculos[].
 * Admin only.
 */
const deleteVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    if (vehicle.parqueadero_id) {
      await Unit.findByIdAndUpdate(vehicle.parqueadero_id, { estado: 'desocupado' });
    }

    await Vehicle.findByIdAndUpdate(req.params.id, {
      activo:         false,
      deletedAt:      new Date(),
      parqueadero_id: null,
    });

    await Unit.findByIdAndUpdate(vehicle.unit_id, {
      $pull: { vehiculos: vehicle._id },
    });

    res.status(200).json({ success: true, message: 'Vehicle removed from registry' });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PARKING SPOTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/parking/spots
 * Lists all parking spots (Units with tipo='parqueadero').
 * Includes assigned vehicle on occupied spots.
 * Optional filter: ?estado=desocupado | ?estado=ocupado
 */
const getSpots = async (req, res, next) => {
  try {
    const filter = { conjunto_id: req.user.conjunto_id, tipo: 'parqueadero' };
    if (req.query.estado) filter.estado = req.query.estado;

    const spots = await Unit.find(filter)
      .populate('propietario_actual', 'nombres apellidos')
      .sort({ numero: 1 })
      .lean();

    const spotsWithVehicle = await Promise.all(
      spots.map(async (spot) => {
        if (spot.estado === 'ocupado') {
          const vehicle = await Vehicle.findOne({ parqueadero_id: spot._id, activo: true })
            .populate('unit_id',        'numero torre')
            .populate('propietario_id', 'nombres apellidos')
            .lean();
          return { ...spot, vehiculo_asignado: vehicle };
        }
        return { ...spot, vehiculo_asignado: null };
      })
    );

    const summary = {
      total:         spots.length,
      ocupados:      spots.filter((s) => s.estado === 'ocupado').length,
      libres:        spots.filter((s) => s.estado === 'desocupado').length,
      mantenimiento: spots.filter((s) => s.estado === 'en_mantenimiento').length,
    };

    res.status(200).json({ success: true, summary, data: spotsWithVehicle });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/parking/spots/:spotId
 * Returns a specific spot with its assigned vehicle.
 */
const getSpotById = async (req, res, next) => {
  try {
    const spot = await Unit.findOne({
      _id:         req.params.spotId,
      conjunto_id: req.user.conjunto_id,
      tipo:        'parqueadero',
    })
      .populate('propietario_actual', 'nombres apellidos')
      .lean();

    if (!spot) {
      return res.status(404).json({ success: false, message: 'Parking spot not found' });
    }

    const vehicle = await Vehicle.findOne({ parqueadero_id: spot._id, activo: true })
      .populate('unit_id',        'numero torre')
      .populate('propietario_id', 'nombres apellidos celular')
      .lean();

    res.status(200).json({
      success: true,
      data: { ...spot, vehiculo_asignado: vehicle || null },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SPOT ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/parking/vehicles/:vehicleId/assign
 * Assigns a parking spot to a vehicle.
 * Validations: vehicle exists, spot is free, vehicle has no spot yet.
 */
const assignSpot = async (req, res, next) => {
  try {
    const { parqueadero_id } = req.body;

    const vehicle = await Vehicle.findOne({
      _id:         req.params.vehicleId,
      conjunto_id: req.user.conjunto_id,
      activo:      true,
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    if (vehicle.parqueadero_id) {
      return res.status(409).json({
        success: false,
        message: 'This vehicle already has a parking spot. Unassign it first.',
      });
    }

    const spot = await Unit.findOne({
      _id:         parqueadero_id,
      conjunto_id: req.user.conjunto_id,
      tipo:        'parqueadero',
    });

    if (!spot) {
      return res.status(404).json({ success: false, message: 'Parking spot not found' });
    }

    if (spot.estado !== 'desocupado') {
      return res.status(409).json({
        success: false,
        message: `Spot ${spot.numero} is not available (status: ${spot.estado})`,
      });
    }

    const [updatedVehicle] = await Promise.all([
      Vehicle.findByIdAndUpdate(vehicle._id, { parqueadero_id }, { new: true })
        .populate('unit_id',        'numero torre')
        .populate('propietario_id', 'nombres apellidos')
        .populate('parqueadero_id', 'numero'),
      Unit.findByIdAndUpdate(parqueadero_id, { estado: 'ocupado' }),
    ]);

    res.status(200).json({
      success: true,
      data: updatedVehicle,
      message: `Vehicle ${vehicle.placa} assigned to spot ${spot.numero}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/parking/vehicles/:vehicleId/unassign
 * Frees the parking spot from a vehicle.
 */
const unassignSpot = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id:         req.params.vehicleId,
      conjunto_id: req.user.conjunto_id,
      activo:      true,
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    if (!vehicle.parqueadero_id) {
      return res.status(409).json({
        success: false,
        message: 'This vehicle does not have a parking spot assigned',
      });
    }

    const spotId = vehicle.parqueadero_id;

    const [updatedVehicle] = await Promise.all([
      Vehicle.findByIdAndUpdate(vehicle._id, { parqueadero_id: null }, { new: true })
        .populate('unit_id', 'numero torre'),
      Unit.findByIdAndUpdate(spotId, { estado: 'desocupado' }),
    ]);

    res.status(200).json({
      success: true,
      data: updatedVehicle,
      message: `Vehicle ${vehicle.placa} unassigned. Spot freed.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/parking/unit/:unitId
 * Lists all vehicles and their spots for a specific residential unit.
 */
const getVehiclesByUnit = async (req, res, next) => {
  try {
    const unit = await Unit.findOne({
      _id:         req.params.unitId,
      conjunto_id: req.user.conjunto_id,
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const vehicles = await Vehicle.find({ unit_id: req.params.unitId, activo: true })
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'numero estado')
      .lean();

    res.status(200).json({
      success: true,
      unit: { numero: unit.numero, torre: unit.torre },
      total_vehicles: vehicles.length,
      data: vehicles,
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
  getSpots,
  getSpotById,
  assignSpot,
  unassignSpot,
  getVehiclesByUnit,
};