/**
 * HomeAccess - Controlador del Security Guard
 * =============================================
 * Usa los modelos reales del proyecto:
 *   - AccessLog.model.js   → registros de acceso
 *   - Package.model.js     → paquetes
 *   - Unit.model.js        → unidades (incluye parqueaderos tipo='parqueadero')
 *   - CommonArea.model.js  → áreas comunes
 *   - Event.model.js       → eventos
 *   - Vehicle.model.js     → vehículos registrados (lo que ve el admin en /parqueadero)
 */

const AccessLog  = require('../models/AccessLog.model');
const Package    = require('../models/Package.model');
const Unit       = require('../models/Unit.model');
const CommonArea = require('../models/CommonArea.model');
const Event      = require('../models/Event.model');
const Vehicle    = require('../models/Vehicle.model');

// ============================================================
// REGISTROS DE ACCESO — VISITANTES
// ============================================================

/**
 * GET /api/v1/securityguard/access-logs
 * Campos reales: tipo_persona, tipo_acceso, porteria, persona_id,
 * nombre_visitante, doc_visitante, unit_destino, portero_id, timestamp
 */
const getAccessLogs = async (req, res, next) => {
  try {
    const { type, date, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (type) filter.tipo_acceso = type;
    if (date) {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end   = new Date(date); end.setHours(23, 59, 59, 999);
      filter.timestamp = { $gte: start, $lte: end };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AccessLog.find(filter)
        .populate('persona_id',    'nombres apellidos')
        .populate('portero_id',    'nombres apellidos')
        .populate('unit_destino',  'numero torre')
        .populate('autorizado_por','nombres apellidos')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AccessLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { logs, total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/securityguard/access-logs/active
 * Visitantes actualmente dentro (tienen entrada sin salida posterior)
 */
const getActiveVisitors = async (req, res, next) => {
  try {
    const entries = await AccessLog.find({ tipo_acceso: 'entrada' })
      .populate('persona_id',   'nombres apellidos')
      .populate('unit_destino', 'numero torre')
      .sort({ timestamp: -1 })
      .limit(200);

    const active = [];
    for (const entry of entries) {
      const docRef = entry.doc_visitante || entry.persona_id?._id?.toString();
      if (!docRef) { active.push(entry); continue; }
      const exit = await AccessLog.findOne({
        tipo_acceso: 'salida',
        $or: [
          { doc_visitante: entry.doc_visitante },
          { persona_id:    entry.persona_id?._id },
        ],
        timestamp: { $gt: entry.timestamp },
      });
      if (!exit) active.push(entry);
    }

    res.json({ success: true, data: { active, total: active.length } });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/securityguard/access-logs/entry
 */
const registerEntry = async (req, res, next) => {
  try {
    const {
      tipo_persona, persona_id, nombre_visitante, doc_visitante,
      unit_destino, porteria, metodo, observaciones,
    } = req.body;

    const log = await AccessLog.create({
      conjunto_id:     req.user.conjunto_id || undefined,
      tipo_persona:    tipo_persona || 'visitante',
      persona_id:      persona_id   || null,
      nombre_visitante,
      doc_visitante,
      unit_destino,
      porteria:        porteria     || 'Principal',
      metodo:          metodo       || 'manual',
      tipo_acceso:     'entrada',
      portero_id:      req.user._id,
      observaciones,
      timestamp:       new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Entrada registrada exitosamente',
      data: { log },
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/securityguard/access-logs/exit
 */
const registerExit = async (req, res, next) => {
  try {
    const {
      tipo_persona, persona_id, nombre_visitante, doc_visitante,
      unit_destino, porteria, observaciones,
    } = req.body;

    const log = await AccessLog.create({
      conjunto_id:     req.user.conjunto_id || undefined,
      tipo_persona:    tipo_persona || 'visitante',
      persona_id:      persona_id   || null,
      nombre_visitante,
      doc_visitante,
      unit_destino,
      porteria:        porteria     || 'Principal',
      metodo:          'manual',
      tipo_acceso:     'salida',
      portero_id:      req.user._id,
      observaciones,
      timestamp:       new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Salida registrada exitosamente',
      data: { log },
    });
  } catch (err) { next(err); }
};

// ============================================================
// PAQUETES
// ============================================================

/**
 * GET /api/v1/securityguard/packages
 * Campos reales del modelo: unit_destino, destinatario_id, guia,
 * transportadora, tipo, remitente, estado, fecha_recepcion
 */
const getPackages = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.estado = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [packages, total] = await Promise.all([
      Package.find(filter)
        .populate('recibido_por',   'nombres apellidos')
        .populate('entregado_a',    'nombres apellidos')
        .populate('destinatario_id','nombres apellidos')
        .populate('unit_destino',   'numero torre')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Package.countDocuments(filter),
    ]);

    // Resumen por estado
    const [en_porteria, entregado, devuelto, perdido] = await Promise.all([
      Package.countDocuments({ estado: 'en_porteria' }),
      Package.countDocuments({ estado: 'entregado' }),
      Package.countDocuments({ estado: 'devuelto' }),
      Package.countDocuments({ estado: 'perdido' }),
    ]);

    res.json({
      success: true,
      data: {
        packages, total,
        page: Number(page),
        pages: Math.ceil(total / limit),
        resumen: { en_porteria, entregado, devuelto, perdido },
      },
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/securityguard/packages
 */
const registerPackage = async (req, res, next) => {
  try {
    const {
      unit_destino, destinatario_id, tipo,
      remitente, transportadora, guia, descripcion,
    } = req.body;

    // conjunto_id viene del usuario autenticado
    const pkg = await Package.create({
      conjunto_id:     req.user.conjunto_id || undefined,
      unit_destino,
      destinatario_id,
      tipo:            tipo || 'paquete',
      remitente,
      transportadora,
      guia,
      descripcion,
      estado:          'en_porteria',
      recibido_por:    req.user._id,
      fecha_recepcion: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Paquete registrado en portería',
      data: { package: pkg },
    });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/v1/securityguard/packages/:id/deliver
 */
const deliverPackage = async (req, res, next) => {
  try {
    const pkg = await Package.findByIdAndUpdate(
      req.params.id,
      {
        estado:       'entregado',
        entregado_a:  req.user._id,
        fecha_entrega: new Date(),
      },
      { new: true }
    );
    if (!pkg) return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    res.json({ success: true, message: 'Paquete marcado como entregado', data: { package: pkg } });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/v1/securityguard/packages/:id/return
 */
const returnPackage = async (req, res, next) => {
  try {
    const pkg = await Package.findByIdAndUpdate(
      req.params.id,
      { estado: 'devuelto' },
      { new: true }
    );
    if (!pkg) return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    res.json({ success: true, message: 'Paquete marcado como devuelto', data: { package: pkg } });
  } catch (err) { next(err); }
};

// ============================================================
// UNIDADES (solo lectura)
// ============================================================

/**
 * GET /api/v1/securityguard/units
 */
const getUnits = async (req, res, next) => {
  try {
    const { tower, search } = req.query;
    const filter = {};
    if (tower)  filter.torre  = tower;
    if (search) filter.numero = { $regex: search, $options: 'i' };

    const units = await Unit.find(filter)
      .populate('propietario_actual', 'nombres apellidos celular')
      .sort({ torre: 1, numero: 1 });

    res.json({ success: true, data: { units, total: units.length } });
  } catch (err) { next(err); }
};

// ============================================================
// ÁREAS COMUNES (solo lectura)
// ============================================================

/**
 * GET /api/v1/securityguard/common-areas
 */
const getCommonAreas = async (req, res, next) => {
  try {
    const { estado } = req.query;
    const filter = {};
    if (estado) filter.estado = estado;

    const areas = await CommonArea.find(filter).sort({ nombre: 1 });
    res.json({ success: true, data: { areas, total: areas.length } });
  } catch (err) { next(err); }
};

// ============================================================
// PARQUEADERO — usa Vehicle.model.js (igual que el admin)
// ============================================================

/**
 * GET /api/v1/securityguard/parking
 * Muestra los vehículos registrados con su puesto asignado.
 * Mismo origen de datos que el módulo /parqueadero del admin.
 */
const getParking = async (req, res, next) => {
  try {
    const { tipo, search } = req.query;
    const filter = {};
    if (tipo)   filter.tipo  = tipo;
    if (search) filter.placa = { $regex: search, $options: 'i' };

    const vehicles = await Vehicle.find(filter)
      .populate('unit_id',        'numero torre')
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'numero torre')
      .sort({ placa: 1 });

    const total      = await Vehicle.countDocuments({});
    const conPuesto  = await Vehicle.countDocuments({ parqueadero_id: { $ne: null } });
    const sinPuesto  = total - conPuesto;
    const motos      = await Vehicle.countDocuments({ tipo: 'moto' });
    const carros     = await Vehicle.countDocuments({ tipo: 'carro' });
    const bicicletas = await Vehicle.countDocuments({ tipo: 'bicicleta' });

    res.json({
      success: true,
      data: {
        vehicles,
        resumen: { total, conPuesto, sinPuesto, motos, carros, bicicletas },
      },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/securityguard/parking-spots
 * Mapa de puestos: Units con tipo='parqueadero', populadas con su vehículo asignado
 */
const getParkingSpots = async (req, res, next) => {
  try {
    const { estado } = req.query;
    const filter = { tipo: 'parqueadero' };
    if (estado) filter.estado = estado;

    const puestos = await Unit.find(filter)
      .populate({
        path: 'vehiculos',
        select: 'placa tipo marca color unit_id propietario_id',
        populate: [
          { path: 'unit_id',        select: 'numero torre' },
          { path: 'propietario_id', select: 'nombres apellidos' },
        ],
      })
      .sort({ numero: 1 });

    res.json({ success: true, data: { puestos, total: puestos.length } });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/securityguard/events
 * El modelo usa: titulo, descripcion, tipo (obligatorio/opcional),
 * fecha_inicio, fecha_fin, lugar, estado (programado/en_curso/finalizado/cancelado)
 */
const getEvents = async (req, res, next) => {
  try {
    // Traer TODOS los eventos sin filtrar por fecha ni conjunto
    // El middleware del modelo ya excluye soft-deleted (deletedAt != null)
    const events = await Event.find({
      estado: { $in: ['programado', 'en_curso', 'finalizado'] },
    })
      .populate('creado_por', 'nombres apellidos')
      .populate('area_comun_id', 'nombre')
      .sort({ fecha_inicio: -1 }); // más recientes primero

    res.json({ success: true, data: {
      upcoming: events,  // mandamos todo como upcoming para que el frontend lo muestre
      past:     [],
      total:    events.length,
    }});
  } catch (err) { next(err); }
};

module.exports = {
  getAccessLogs, getActiveVisitors, registerEntry, registerExit,
  getPackages, registerPackage, deliverPackage, returnPackage,
  getUnits,
  getCommonAreas,
  getParking, getParkingSpots,
  getEvents,
};