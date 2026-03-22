/**
 * HomeAccess - Controlador del Portal de Residentes
 * Ruta: src/controllers/resident.controller.js
 */

const Package    = require('../models/Package.model');
const Vehicle    = require('../models/Vehicle.model');
const CommonArea = require('../models/CommonArea.model');
const Event      = require('../models/Event.model');
const Visitor    = require('../models/Visitor.model');

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

// ── Visitantes pre-autorizados ────────────────────────────────

const getMyVisitors = async (req, res, next) => {
  try {
    const visitors = await Visitor.find({ residente_id: req.user._id }).sort({ fecha_visita: -1 });
    res.json({ success: true, data: { visitors, total: visitors.length } });
  } catch (err) { next(err); }
};

const registerVisitor = async (req, res, next) => {
  try {
    const { nombre_visitante, doc_visitante, tipo, fecha_visita, observaciones } = req.body;
    const visitor = await Visitor.create({
      residente_id:     req.user._id,
      unit_id:          req.user.unidades?.[0] || null,
      nombre_visitante,
      doc_visitante,
      tipo:             tipo || 'visita',
      fecha_visita:     new Date(fecha_visita),
      observaciones,
      estado:           'pendiente',
    });
    res.status(201).json({
      success: true,
      message: 'Visitante registrado. El portero podrá ver la pre-autorización.',
      data: { visitor },
    });
  } catch (err) { next(err); }
};

const cancelVisitor = async (req, res, next) => {
  try {
    const visitor = await Visitor.findOneAndUpdate(
      { _id: req.params.id, residente_id: req.user._id, estado: 'pendiente' },
      { estado: 'cancelado' },
      { new: true }
    );
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitante no encontrado o ya no puede cancelarse' });
    res.json({ success: true, message: 'Visitante cancelado', data: { visitor } });
  } catch (err) { next(err); }
};

// El portero consulta visitantes pre-autorizados
const searchVisitors = async (req, res, next) => {
  try {
    const { nombre, doc } = req.query;
    const filter = { estado: 'pendiente' };
    if (nombre) filter.nombre_visitante = { $regex: nombre, $options: 'i' };
    if (doc)    filter.doc_visitante    = doc;
    const visitors = await Visitor.find(filter)
      .populate('residente_id', 'nombres apellidos celular')
      .populate('unit_id', 'numero torre')
      .sort({ fecha_visita: 1 }).limit(10);
    res.json({ success: true, data: { visitors } });
  } catch (err) { next(err); }
};

module.exports = { getMyPackages, getMyVehicles, getCommonAreas, getEvents, getMyVisitors, registerVisitor, cancelVisitor, searchVisitors };