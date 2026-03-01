/**
 * HomeAccess - Controlador de Control de Acceso
 * ===============================================
 * Gestiona el registro de ingresos y salidas en portería.
 */

const AccessLog = require('../models/AccessLog.model');

/**
 * POST /api/v1/access-logs
 * Registra un nuevo ingreso o salida.
 * Solo porteros y administradores pueden crear registros.
 */
const createAccessLog = async (req, res, next) => {
  try {
    const log = await AccessLog.create({
      ...req.body,
      conjunto_id: req.user.conjunto_id,
      portero_id: req.user._id, // El portero es quien está autenticado
      timestamp: new Date(),
    });

    // Popular referencias para la respuesta
    const populated = await log.populate([
      { path: 'persona_id', select: 'nombres apellidos' },
      { path: 'unit_destino', select: 'numero torre' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Acceso registrado exitosamente',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/access-logs
 * Lista los registros de acceso con filtros y paginación.
 */
const getAccessLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id };

    // Filtros opcionales
    if (req.query.tipo_persona) filter.tipo_persona = req.query.tipo_persona;
    if (req.query.tipo_acceso) filter.tipo_acceso = req.query.tipo_acceso;
    if (req.query.unit_id) filter.unit_destino = req.query.unit_id;

    // Filtro por rango de fechas: ?desde=2024-01-01&hasta=2024-12-31
    if (req.query.desde || req.query.hasta) {
      filter.timestamp = {};
      if (req.query.desde) filter.timestamp.$gte = new Date(req.query.desde);
      if (req.query.hasta) filter.timestamp.$lte = new Date(req.query.hasta);
    }

    const [logs, total] = await Promise.all([
      AccessLog.find(filter)
        .sort({ timestamp: -1 }) // Más recientes primero
        .skip(skip)
        .limit(limit)
        .populate('persona_id', 'nombres apellidos')
        .populate('unit_destino', 'numero torre')
        .populate('portero_id', 'nombres apellidos')
        .lean(),
      AccessLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/access-logs/active
 * Retorna las personas que están actualmente dentro del conjunto
 * (tienen entrada pero no salida en el día).
 */
const getActivePeople = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Agrupación para encontrar último registro por persona
    const activePeople = await AccessLog.aggregate([
      {
        $match: {
          conjunto_id: req.user.conjunto_id,
          timestamp: { $gte: today },
        },
      },
      {
        $sort: { timestamp: -1 },
      },
      {
        // Tomar solo el último registro de cada persona
        $group: {
          _id: '$persona_id',
          ultimo_registro: { $first: '$$ROOT' },
        },
      },
      {
        // Filtrar solo los que tienen 'entrada' como último evento
        $match: { 'ultimo_registro.tipo_acceso': 'entrada' },
      },
    ]);

    res.status(200).json({
      success: true,
      data: activePeople,
      total: activePeople.length,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createAccessLog, getAccessLogs, getActivePeople };
