/**
 * HomeAccess - Vehicle Controller (v2)
 * parqueadero_id referencia la colección Parking (no Unit)
 */

const Vehicle = require('../models/Vehicle.model');
const Unit    = require('../models/Unit.model');
const Parking = require('../models/Parking.model');

// Helper: adapta campos de Parking para que el frontend reciba numero/estado
const adaptSpot = (spot) => {
  if (!spot) return null;
  return {
    ...spot,
    numero: spot.number || spot.numero,
    estado: spot.status === 'available'   ? 'desocupado'
          : spot.status === 'occupied'    ? 'ocupado'
          : spot.status === 'maintenance' ? 'en_mantenimiento'
          : spot.status || spot.estado,
  };
};

// Helper: populate + adapt parqueadero_id desde Parking
const populateAndAdapt = async (vehicles) => {
  return Promise.all(vehicles.map(async (v) => {
    if (!v.parqueadero_id) return v;
    // Si ya está populado como objeto
    if (typeof v.parqueadero_id === 'object' && v.parqueadero_id.number !== undefined) {
      return { ...v, parqueadero_id: adaptSpot(v.parqueadero_id) };
    }
    // Si es solo un ObjectId, buscarlo en Parking
    const spot = await Parking.findById(v.parqueadero_id).lean();
    return { ...v, parqueadero_id: spot ? adaptSpot(spot) : v.parqueadero_id };
  }));
};

const getVehicles = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { activo: true };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;
    if (!['admin', 'portero'].includes(req.user.role)) {
      filter.unit_id = { $in: req.user.unidades };
    }
    if (req.query.unit_id)               filter.unit_id        = req.query.unit_id;
    if (req.query.tipo)                  filter.tipo           = req.query.tipo;
    if (req.query.placa)                 filter.placa          = new RegExp(req.query.placa.toUpperCase(), 'i');
    if (req.query.con_puesto === 'true') filter.parqueadero_id = { $ne: null };
    if (req.query.sin_puesto === 'true') filter.parqueadero_id = null;

    const [rawVehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('unit_id',        'numero torre piso')
        .populate('propietario_id', 'nombres apellidos celular')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Vehicle.countDocuments(filter),
    ]);

    // Popular parqueadero_id desde Parking y adaptar campos
    const vehicles = await populateAndAdapt(rawVehicles);

    const matchResumen = { activo: true };
    if (req.user.conjunto_id) matchResumen.conjunto_id = req.user.conjunto_id;
    const resumen = await Vehicle.aggregate([
      { $match: matchResumen },
      { $group: { _id: '$tipo', total: { $sum: 1 } } },
    ]);
    const porTipo = resumen.reduce((acc, r) => { acc[r._id] = r.total; return acc; }, {});

    res.status(200).json({
      success: true,
      data: vehicles,
      resumen: porTipo,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) { next(error); }
};

const getVehicleById = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;

    const raw = await Vehicle.findOne(filter)
      .populate('unit_id',        'numero torre piso')
      .populate('propietario_id', 'nombres apellidos celular')
      .lean();

    if (!raw) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });

    const [vehicle] = await populateAndAdapt([raw]);
    res.status(200).json({ success: true, data: vehicle });
  } catch (error) { next(error); }
};

const createVehicle = async (req, res, next) => {
  try {
    const { unit_id, propietario_id, placa, tipo, marca, modelo, color, anio } = req.body;

    const unitFilter = { _id: unit_id };
    if (req.user.conjunto_id) unitFilter.conjunto_id = req.user.conjunto_id;
    const unit = await Unit.findOne(unitFilter);
    if (!unit) return res.status(404).json({ success: false, message: 'Unidad no encontrada' });

    const requiresPlate = ['carro', 'moto'].includes(tipo);
    if (requiresPlate && !placa) return res.status(400).json({ success: false, message: `La placa es obligatoria para '${tipo}'` });

    if (placa) {
      const dupFilter = { placa: placa.toUpperCase() };
      if (req.user.conjunto_id) dupFilter.conjunto_id = req.user.conjunto_id;
      const existing = await Vehicle.findOne(dupFilter);
      if (existing) return res.status(409).json({ success: false, message: `La placa ${placa.toUpperCase()} ya está registrada` });
    }

    const vehicle = await Vehicle.create({
      conjunto_id: req.user.conjunto_id || null,
      unit_id, propietario_id,
      placa: placa ? placa.toUpperCase() : null,
      tipo, marca, modelo, color, anio,
    });

    await Unit.findByIdAndUpdate(unit_id, { $addToSet: { vehiculos: vehicle._id } });

    const populated = await vehicle.populate([
      { path: 'unit_id',        select: 'numero torre' },
      { path: 'propietario_id', select: 'nombres apellidos' },
    ]);

    res.status(201).json({
      success: true,
      data: populated,
      message: `Vehículo ${vehicle.placa || tipo} registrado exitosamente`,
    });
  } catch (error) { next(error); }
};

const updateVehicle = async (req, res, next) => {
  try {
    ['placa', 'conjunto_id', 'parqueadero_id', 'deletedAt', 'activo'].forEach(f => delete req.body[f]);

    const filter = { _id: req.params.id };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;

    const raw = await Vehicle.findOneAndUpdate(filter, req.body, { new: true, runValidators: true })
      .populate('unit_id',        'numero torre')
      .populate('propietario_id', 'nombres apellidos')
      .lean();

    if (!raw) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });

    const [vehicle] = await populateAndAdapt([raw]);
    res.status(200).json({ success: true, data: vehicle, message: 'Vehículo actualizado exitosamente' });
  } catch (error) { next(error); }
};

const deleteVehicle = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;

    const vehicle = await Vehicle.findOne(filter);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });

    // Liberar puesto en Parking si tenía asignado
    if (vehicle.parqueadero_id) {
      await Parking.findByIdAndUpdate(vehicle.parqueadero_id, {
        status: 'available', unit_id: null, owner_id: null, vehicle_plate: null,
      });
    }

    await Vehicle.findByIdAndUpdate(req.params.id, { activo: false, deletedAt: new Date(), parqueadero_id: null });
    await Unit.findByIdAndUpdate(vehicle.unit_id, { $pull: { vehiculos: vehicle._id } });

    res.status(200).json({ success: true, message: `Vehículo ${vehicle.placa || vehicle.tipo} eliminado del registro` });
  } catch (error) { next(error); }
};

const getVehiclesByUnit = async (req, res, next) => {
  try {
    const unitFilter = { _id: req.params.unitId };
    if (req.user.conjunto_id) unitFilter.conjunto_id = req.user.conjunto_id;

    const unit = await Unit.findOne(unitFilter);
    if (!unit) return res.status(404).json({ success: false, message: 'Unidad no encontrada' });

    const rawVehicles = await Vehicle.find({ unit_id: req.params.unitId, activo: true })
      .populate('propietario_id', 'nombres apellidos celular')
      .lean();

    const vehicles = await populateAndAdapt(rawVehicles);

    res.status(200).json({
      success: true,
      unit: { numero: unit.numero, torre: unit.torre },
      total_vehicles: vehicles.length,
      data: vehicles,
    });
  } catch (error) { next(error); }
};

module.exports = { getVehicles, getVehicleById, createVehicle, updateVehicle, deleteVehicle, getVehiclesByUnit };