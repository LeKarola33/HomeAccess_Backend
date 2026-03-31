const Package    = require('../models/Package.model');
const Vehicle    = require('../models/Vehicle.model');
const CommonArea = require('../models/CommonArea.model');
const Event      = require('../models/Event.model');
const Visitor    = require('../models/Visitor.model');
const Unit       = require('../models/Unit.model');
const User       = require('../models/User.model');

const getMyPackages = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { destinatario_id: req.user._id };
    if (status) filter.estado = status;
    const [packages, total] = await Promise.all([
      Package.find(filter).populate('unit_destino', 'numero torre').sort({ fecha_recepcion: -1 }),
      Package.countDocuments(filter),
    ]);
    const [en_porteria, entregado, devuelto, perdido] = await Promise.all([
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'en_porteria' }),
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'entregado' }),
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'devuelto' }),
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'perdido' }),
    ]);
    res.json({ success: true, data: { packages, total, resumen: { en_porteria, entregado, devuelto, perdido } } });
  } catch (err) { next(err); }
};

const getMyVehicles = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find({ propietario_id: req.user._id })
      .populate('parqueadero_id', 'numero').populate('unit_id', 'numero torre').sort({ createdAt: -1 });
    res.json({ success: true, data: { vehicles, total: vehicles.length } });
  } catch (err) { next(err); }
};

const getCommonAreas = async (req, res, next) => {
  try {
    const { estado } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;
    const areas = await CommonArea.find(filter).sort({ nombre: 1 });
    res.json({ success: true, data: { areas, total: areas.length } });
  } catch (err) { next(err); }
};

const getEvents = async (req, res, next) => {
  try {
    const now = new Date();
    const events = await Event.find({ estado: { $in: ['programado', 'en_curso', 'finalizado'] } })
      .populate('creado_por', 'nombres apellidos').sort({ fecha_inicio: 1 });
    const upcoming = events.filter(e => ['programado', 'en_curso'].includes(e.estado) || new Date(e.fecha_inicio) >= now);
    const past = events.filter(e => e.estado === 'finalizado' || (e.estado !== 'programado' && new Date(e.fecha_inicio) < now));
    res.json({ success: true, data: { upcoming, past, total: events.length } });
  } catch (err) { next(err); }
};

const getMyUnit = async (req, res, next) => {
  try {
    // Estrategia 1: desde unidades[] del usuario
    const userFull = await User.findById(req.user._id).select('unidades');
    let unit = null;
    if (userFull?.unidades?.length > 0) {
      unit = await Unit.findById(userFull.unidades[0]).select('numero torre piso tipo');
    }
    // Estrategia 2: buscar donde el usuario es propietario_actual
    if (!unit) {
      unit = await Unit.findOne({ propietario_actual: req.user._id }).select('numero torre piso tipo');
    }
    res.json({ success: true, data: { unit } });
  } catch (err) { next(err); }
};

const getMyVisitors = async (req, res, next) => {
  try {
    const visitors = await Visitor.find({ residente_id: req.user._id })
      .populate('unit_destino', 'numero torre')
      .sort({ fecha_visita: -1 });
    res.json({ success: true, data: { visitors, total: visitors.length } });
  } catch (err) { next(err); }
};

const registerVisitor = async (req, res, next) => {
  try {
    const { nombre_visitante, doc_visitante, tipo, fecha_visita, observaciones } = req.body;
    const userFull = await User.findById(req.user._id).select('unidades');
    let unitId = userFull?.unidades?.[0] || null;
    if (!unitId) {
      const unit = await Unit.findOne({ propietario_actual: req.user._id }).select('_id');
      unitId = unit?._id || null;
    }
    const visitor = await Visitor.create({
      residente_id: req.user._id,
      unit_id:      unitId,
      unit_destino: unitId,
      nombre_visitante, doc_visitante,
      tipo: tipo || 'visita',
      fecha_visita: new Date(fecha_visita),
      observaciones,
      estado: 'pendiente',
    });
    res.status(201).json({ success: true, message: 'Visitante registrado.', data: { visitor } });
  } catch (err) { next(err); }
};

const updateVisitor = async (req, res, next) => {
  try {
    const { nombre_visitante, doc_visitante, tipo, fecha_visita, observaciones } = req.body;
    const visitor = await Visitor.findOneAndUpdate(
      { _id: req.params.id, residente_id: req.user._id, estado: 'pendiente' },
      {
        nombre_visitante,
        doc_visitante,
        tipo,
        fecha_visita: new Date(fecha_visita),
        observaciones,
      },
      { new: true }
    );
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitante no encontrado o no puede editarse' });
    res.json({ success: true, message: 'Visitante actualizado', data: { visitor } });
  } catch (err) { next(err); }
};

const cancelVisitor = async (req, res, next) => {
  try {
    const visitor = await Visitor.findOneAndUpdate(
      { _id: req.params.id, residente_id: req.user._id, estado: 'pendiente' },
      { estado: 'cancelado' }, { new: true }
    );
    if (!visitor) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: { visitor } });
  } catch (err) { next(err); }
};

const marcarIngreso = async (req, res, next) => {
  try {
    const visitor = await Visitor.findByIdAndUpdate(
      req.params.id,
      { estado: 'ingresado' },
      { new: true }
    );
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitante no encontrado' });
    res.json({ success: true, message: 'Ingreso registrado', data: { visitor } });
  } catch (err) { next(err); }
};

const marcarSalida = async (req, res, next) => {
  try {
    const visitor = await Visitor.findByIdAndUpdate(
      req.params.id,
      { estado: 'cancelado' },
      { new: true }
    );
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitante no encontrado' });
    res.json({ success: true, message: 'Salida registrada', data: { visitor } });
  } catch (err) { next(err); }
};

const searchVisitors = async (req, res, next) => {
  try {
    const { nombre, doc, estado } = req.query;
    const filter = { estado: estado || 'pendiente' };
    if (nombre) filter.nombre_visitante = { $regex: nombre, $options: 'i' };
    if (doc)    filter.doc_visitante    = doc;
    const visitors = await Visitor.find(filter)
      .populate('residente_id', 'nombres apellidos celular')
      .populate('unit_destino', 'numero torre')
      .sort({ fecha_visita: -1 }).limit(50);
    res.json({ success: true, data: { visitors } });
  } catch (err) { next(err); }
};

module.exports = { getMyPackages, getMyVehicles, getCommonAreas, getEvents, getMyUnit, getMyVisitors, registerVisitor, updateVisitor, cancelVisitor, marcarIngreso, marcarSalida, searchVisitors };