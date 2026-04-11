/**
 * HomeAccess - Parking Controller (v2)
 * Puestos de parqueadero → colección parkings (Parking.model.js)
 * Vehículos → colección vehicles (Vehicle.model.js)
 */

const Vehicle = require('../models/Vehicle.model');
const Unit    = require('../models/Unit.model');
const Parking = require('../models/Parking.model');

// Helper: adapta campos Parking → frontend (numero/estado)
const adaptSpot = (spot) => {
  if (!spot) return null;
  const numero = spot.number || spot.numero || '';
  const estado = spot.status === 'available'   ? 'desocupado'
               : spot.status === 'occupied'    ? 'ocupado'
               : spot.status === 'maintenance' ? 'en_mantenimiento'
               : spot.status || spot.estado    || 'desocupado';
  return { ...spot, numero, estado };
};

const populateAndAdapt = async (vehicles) => {
  return Promise.all(vehicles.map(async (v) => {
    if (!v.parqueadero_id) return v;
    if (typeof v.parqueadero_id === 'object' && v.parqueadero_id.number !== undefined) {
      return { ...v, parqueadero_id: adaptSpot(v.parqueadero_id) };
    }
    const spot = await Parking.findById(v.parqueadero_id).lean();
    return { ...v, parqueadero_id: spot ? adaptSpot(spot) : v.parqueadero_id };
  }));
};

// ── VEHICLES ──────────────────────────────────────────────────

const getVehicles = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { activo: true, deletedAt: null };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;
    if (!['admin', 'portero'].includes(req.user.role)) {
      filter.unit_id = { $in: req.user.unidades };
    }
    if (req.query.unit_id) filter.unit_id = req.query.unit_id;
    if (req.query.tipo)    filter.tipo    = req.query.tipo;
    if (req.query.placa)   filter.placa   = new RegExp(req.query.placa.toUpperCase(), 'i');

    const [rawVehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('unit_id',        'numero torre piso')
        .populate('propietario_id', 'nombres apellidos celular')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Vehicle.countDocuments(filter),
    ]);

    const vehicles = await populateAndAdapt(rawVehicles);

    res.status(200).json({ success: true, data: vehicles, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

const getVehicleById = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;
    const raw = await Vehicle.findOne(filter)
      .populate('unit_id', 'numero torre piso')
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

    const vehicle = await Vehicle.create({
      conjunto_id: req.user.conjunto_id || null,
      unit_id, propietario_id, placa, tipo, marca, modelo, color, anio,
    });
    await Unit.findByIdAndUpdate(unit_id, { $addToSet: { vehiculos: vehicle._id } });
    const populated = await vehicle.populate([
      { path: 'unit_id', select: 'numero torre' },
      { path: 'propietario_id', select: 'nombres apellidos' },
    ]);
    res.status(201).json({ success: true, data: populated, message: `Vehículo ${vehicle.placa} registrado` });
  } catch (error) { next(error); }
};

const updateVehicle = async (req, res, next) => {
  try {
    ['placa', 'conjunto_id', 'parqueadero_id', 'deletedAt'].forEach(f => delete req.body[f]);
    const filter = { _id: req.params.id };
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;
    const vehicle = await Vehicle.findOneAndUpdate(filter, req.body, { new: true, runValidators: true })
      .populate('unit_id', 'numero torre').populate('parqueadero_id', 'number');
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    res.status(200).json({ success: true, data: vehicle });
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
      await Parking.findByIdAndUpdate(vehicle.parqueadero_id, { status: 'available', unit_id: null, owner_id: null, vehicle_plate: null });
    }
    await Vehicle.findByIdAndUpdate(req.params.id, { activo: false, deletedAt: new Date(), parqueadero_id: null });
    await Unit.findByIdAndUpdate(vehicle.unit_id, { $pull: { vehiculos: vehicle._id } });
    res.status(200).json({ success: true, message: 'Vehículo eliminado del registro' });
  } catch (error) { next(error); }
};

// ── PARKING SPOTS (ahora desde colección parkings) ────────────

const getSpots = async (req, res, next) => {
  try {
    // Mapear filtro de estado: frontend usa 'desocupado/ocupado', Parking usa 'available/occupied'
    const statusMap = { desocupado: 'available', ocupado: 'occupied', en_mantenimiento: 'maintenance' };
    const filter = { active: true };
    if (req.query.estado) filter.status = statusMap[req.query.estado] || req.query.estado;

    const spots = await Parking.find(filter).sort({ number: 1 }).lean();

    // Para cada puesto ocupado, buscar el vehículo asignado
    const spotsWithVehicle = await Promise.all(
      spots.map(async (spot) => {
        // Adaptar campos para compatibilidad con el frontend (que usa numero/estado)
        const adapted = {
          ...spot,
          numero: spot.number,
          estado: spot.status === 'available' ? 'desocupado'
                : spot.status === 'occupied'  ? 'ocupado'
                : spot.status === 'maintenance' ? 'en_mantenimiento'
                : spot.status,
        };
        if (spot.status === 'occupied') {
          const vehicle = await Vehicle.findOne({ parqueadero_id: spot._id, activo: true })
            .populate('unit_id', 'numero torre').populate('propietario_id', 'nombres apellidos').lean();
          return { ...adapted, vehiculo_asignado: vehicle };
        }
        return { ...adapted, vehiculo_asignado: null };
      })
    );

    const summary = {
      total:         spots.length,
      ocupados:      spots.filter(s => s.status === 'occupied').length,
      libres:        spots.filter(s => s.status === 'available').length,
      mantenimiento: spots.filter(s => s.status === 'maintenance').length,
    };

    res.status(200).json({ success: true, summary, data: spotsWithVehicle });
  } catch (error) { next(error); }
};

const getSpotById = async (req, res, next) => {
  try {
    const spot = await Parking.findOne({ _id: req.params.spotId, active: true }).lean();
    if (!spot) return res.status(404).json({ success: false, message: 'Puesto no encontrado' });

    const vehicle = await Vehicle.findOne({ parqueadero_id: spot._id, activo: true })
      .populate('unit_id', 'numero torre').populate('propietario_id', 'nombres apellidos celular').lean();

    const adapted = {
      ...spot,
      numero: spot.number,
      estado: spot.status === 'available' ? 'desocupado' : spot.status === 'occupied' ? 'ocupado' : 'en_mantenimiento',
      vehiculo_asignado: vehicle || null,
    };
    res.status(200).json({ success: true, data: adapted });
  } catch (error) { next(error); }
};

// ── SPOT ASSIGNMENT ───────────────────────────────────────────

const assignSpot = async (req, res, next) => {
  try {
    const { parqueadero_id } = req.body;
    const vFilter = { _id: req.params.vehicleId, activo: true };
    if (req.user.conjunto_id) vFilter.conjunto_id = req.user.conjunto_id;

    const vehicle = await Vehicle.findOne(vFilter);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    if (vehicle.parqueadero_id) return res.status(409).json({ success: false, message: 'El vehículo ya tiene puesto asignado' });

    const spot = await Parking.findOne({ _id: parqueadero_id, active: true });
    if (!spot) return res.status(404).json({ success: false, message: 'Puesto no encontrado' });
    if (spot.status !== 'available') return res.status(409).json({ success: false, message: `Puesto ${spot.number} no disponible` });

    const [updatedVehicle] = await Promise.all([
      Vehicle.findByIdAndUpdate(vehicle._id, { parqueadero_id }, { new: true })
        .populate('unit_id', 'numero torre')
        .populate('propietario_id', 'nombres apellidos')
        .populate('parqueadero_id', 'number status'),
      Parking.findByIdAndUpdate(parqueadero_id, {
        status:        'occupied',
        unit_id:       vehicle.unit_id,
        owner_id:      vehicle.propietario_id,
        vehicle_plate: vehicle.placa,
      }),
    ]);

    res.status(200).json({ success: true, data: updatedVehicle, message: `Vehículo ${vehicle.placa} asignado al puesto ${spot.number}` });
  } catch (error) { next(error); }
};

const unassignSpot = async (req, res, next) => {
  try {
    const vFilter = { _id: req.params.vehicleId, activo: true };
    if (req.user.conjunto_id) vFilter.conjunto_id = req.user.conjunto_id;

    const vehicle = await Vehicle.findOne(vFilter);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    if (!vehicle.parqueadero_id) return res.status(409).json({ success: false, message: 'El vehículo no tiene puesto asignado' });

    const spotId = vehicle.parqueadero_id;
    const [updatedVehicle] = await Promise.all([
      Vehicle.findByIdAndUpdate(vehicle._id, { parqueadero_id: null }, { new: true }).populate('unit_id', 'numero torre'),
      Parking.findByIdAndUpdate(spotId, { status: 'available', unit_id: null, owner_id: null, vehicle_plate: null }),
    ]);

    res.status(200).json({ success: true, data: updatedVehicle, message: 'Puesto liberado' });
  } catch (error) { next(error); }
};

const getVehiclesByUnit = async (req, res, next) => {
  try {
    const unitFilter = { _id: req.params.unitId };
    if (req.user.conjunto_id) unitFilter.conjunto_id = req.user.conjunto_id;
    const unit = await Unit.findOne(unitFilter);
    if (!unit) return res.status(404).json({ success: false, message: 'Unidad no encontrada' });

    const vehicles = await Vehicle.find({ unit_id: req.params.unitId, activo: true })
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'number status').lean();

    res.status(200).json({ success: true, unit: { numero: unit.numero, torre: unit.torre }, total_vehicles: vehicles.length, data: vehicles });
  } catch (error) { next(error); }
};

module.exports = { getVehicles, getVehicleById, createVehicle, updateVehicle, deleteVehicle, getSpots, getSpotById, assignSpot, unassignSpot, getVehiclesByUnit };