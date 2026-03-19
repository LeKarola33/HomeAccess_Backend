/**
 * HomeAccess - Controlador del Portal de Residentes
 * Ruta: src/controllers/resident.controller.js
 * Todas las consultas están filtradas por el usuario autenticado
 */

const Package    = require('../models/Package.model');
const Vehicle    = require('../models/Vehicle.model');
const CommonArea = require('../models/CommonArea.model');
const Event      = require('../models/Event.model');
const Unit       = require('../models/Unit.model');

/**
 * GET /api/v1/resident/packages
 * Paquetes donde destinatario_id === usuario autenticado
 */
const getMyPackages = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { destinatario_id: req.user._id };
    if (status) filter.estado = status;

    const [packages, total] = await Promise.all([
      Package.find(filter)
        .populate('unit_destino', 'numero torre')
        .sort({ fecha_recepcion: -1 }),
      Package.countDocuments(filter),
    ]);

    const [en_porteria, entregado, devuelto, perdido] = await Promise.all([
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'en_porteria' }),
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'entregado' }),
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'devuelto' }),
      Package.countDocuments({ destinatario_id: req.user._id, estado: 'perdido' }),
    ]);

    res.json({
      success: true,
      data: {
        packages, total,
        resumen: { en_porteria, entregado, devuelto, perdido },
      },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/resident/vehicles
 * Vehículos donde propietario_id === usuario autenticado
 */
const getMyVehicles = async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find({ propietario_id: req.user._id })
      .populate('parqueadero_id', 'numero')
      .populate('unit_id', 'numero torre')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { vehicles, total: vehicles.length },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/resident/common-areas
 * Todas las áreas comunes (solo lectura)
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

/**
 * GET /api/v1/resident/events
 * Todos los eventos (solo lectura)
 */
const getEvents = async (req, res, next) => {
  try {
    const now = new Date();
    const events = await Event.find({
      estado: { $in: ['programado', 'en_curso', 'finalizado'] },
    })
      .populate('creado_por', 'nombres apellidos')
      .sort({ fecha_inicio: 1 });

    const upcoming = events.filter(e =>
      ['programado', 'en_curso'].includes(e.estado) ||
      new Date(e.fecha_inicio) >= now
    );
    const past = events.filter(e =>
      e.estado === 'finalizado' ||
      (e.estado !== 'programado' && new Date(e.fecha_inicio) < now)
    );

    res.json({ success: true, data: { upcoming, past, total: events.length } });
  } catch (err) { next(err); }
};

module.exports = { getMyPackages, getMyVehicles, getCommonAreas, getEvents };
