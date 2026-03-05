/**
 * HomeAccess - Event Controller
 * ==============================
 * CRUD de eventos + cancelación + confirmaciones de asistencia.
 */

const Event = require('../models/Event.model');

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/events
 * Lista eventos del conjunto con paginación y filtros.
 * Todos los roles autenticados pueden listar eventos.
 *
 * Query params opcionales:
 *   ?tipo=obligatorio|opcional
 *   ?estado=programado|en_curso|finalizado|cancelado
 *   ?desde=YYYY-MM-DD  → eventos desde esta fecha
 *   ?hasta=YYYY-MM-DD  → eventos hasta esta fecha
 *   ?page=1&limit=20
 */
const getEvents = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id };

    if (req.query.tipo)   filter.tipo   = req.query.tipo;
    if (req.query.estado) filter.estado = req.query.estado;

    if (req.query.desde || req.query.hasta) {
      filter.fecha_inicio = {};
      if (req.query.desde) filter.fecha_inicio.$gte = new Date(req.query.desde);
      if (req.query.hasta) filter.fecha_inicio.$lte = new Date(req.query.hasta);
    }

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate('creado_por',    'nombres apellidos')
        .populate('cancelado_por', 'nombres apellidos')
        .populate('area_comun_id', 'nombre')
        .select('-confirmaciones')
        .sort({ fecha_inicio: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Event.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: events,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/events/proximos
 * Eventos programados o en_curso de los próximos 30 días.
 * Endpoint optimizado para el dashboard del residente.
 */
const getUpcoming = async (req, res, next) => {
  try {
    const now     = new Date();
    const in30days = new Date();
    in30days.setDate(in30days.getDate() + 30);

    const events = await Event.find({
      conjunto_id:  req.user.conjunto_id,
      estado:       { $in: ['programado', 'en_curso'] },
      fecha_inicio: { $gte: now, $lte: in30days },
    })
      .populate('creado_por',    'nombres apellidos')
      .populate('area_comun_id', 'nombre')
      .select('-confirmaciones')
      .sort({ fecha_inicio: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: events,
      total: events.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/events/:id
 * Detalle completo de un evento.
 * Admin ve todas las confirmaciones.
 * Residente ve solo su propia confirmación.
 */
const getEventById = async (req, res, next) => {
  try {
    const event = await Event.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    })
      .populate('creado_por',    'nombres apellidos')
      .populate('cancelado_por', 'nombres apellidos')
      .populate('area_comun_id', 'nombre tipo')
      .populate('confirmaciones.unit_id',    'numero torre')
      .populate('confirmaciones.usuario_id', 'nombres apellidos')
      .lean();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    // Residente: filtrar para ver solo su propia confirmación
    if (req.user.role !== 'admin') {
      const myConfirmation = event.confirmaciones.find(
        (c) => c.usuario_id?._id?.toString() === req.user._id.toString()
      );
      event.confirmaciones = myConfirmation ? [myConfirmation] : [];
    }

    // Admin: agregar resumen de confirmaciones
    if (req.user.role === 'admin') {
      event.resumen_confirmaciones = {
        total:       event.confirmaciones.length,
        confirmados: event.confirmaciones.filter((c) => c.respuesta === 'confirmado').length,
        declinados:  event.confirmaciones.filter((c) => c.respuesta === 'declinado').length,
        delegados:   event.confirmaciones.filter((c) => c.respuesta === 'delegado').length,
      };
    }

    res.status(200).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/events
 * Crea un nuevo evento. Solo admin.
 */
const createEvent = async (req, res, next) => {
  try {
    const {
      titulo, descripcion, tipo, fecha_inicio, fecha_fin,
      lugar, area_comun_id, cupo_maximo,
      requiere_confirmacion, fecha_limite_confirmacion,
    } = req.body;

    if (requiere_confirmacion && fecha_limite_confirmacion) {
      if (new Date(fecha_limite_confirmacion) >= new Date(fecha_inicio)) {
        return res.status(400).json({
          success: false,
          message: 'La fecha límite de confirmación debe ser anterior a la fecha del evento',
        });
      }
    }

    if (tipo === 'opcional' && requiere_confirmacion) {
      return res.status(400).json({
        success: false,
        message: 'Los eventos opcionales no requieren confirmación de asistencia',
      });
    }

    const event = await Event.create({
      conjunto_id:               req.user.conjunto_id,
      titulo,
      descripcion,
      tipo,
      fecha_inicio,
      fecha_fin,
      lugar,
      area_comun_id:             area_comun_id || null,
      cupo_maximo:               cupo_maximo   || 0,
      requiere_confirmacion:     requiere_confirmacion || false,
      fecha_limite_confirmacion: fecha_limite_confirmacion || null,
      creado_por:                req.user._id,
    });

    const populated = await event.populate('creado_por', 'nombres apellidos');

    res.status(201).json({
      success: true,
      data: populated,
      message: `Evento "${event.titulo}" creado exitosamente`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/events/:id
 * Actualiza un evento. Solo admin. Solo si está en estado 'programado'.
 */
const updateEvent = async (req, res, next) => {
  try {
    const restricted = [
      'conjunto_id', 'creado_por', 'cancelado_por',
      'fecha_cancelacion', 'motivo_cancelacion',
      'confirmaciones', 'deletedAt', 'estado',
    ];
    restricted.forEach((f) => delete req.body[f]);

    const event = await Event.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    if (event.estado !== 'programado') {
      return res.status(409).json({
        success: false,
        message: `No se puede editar un evento en estado '${event.estado}'`,
      });
    }

    const newStart = req.body.fecha_inicio ? new Date(req.body.fecha_inicio) : event.fecha_inicio;
    const newEnd   = req.body.fecha_fin    ? new Date(req.body.fecha_fin)    : event.fecha_fin;

    if (newEnd <= newStart) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de fin debe ser posterior a la fecha de inicio',
      });
    }

    Object.assign(event, req.body);
    await event.save();

    res.status(200).json({
      success: true,
      data: event,
      message: 'Evento actualizado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/events/:id/estado
 * Cambia el estado: programado→en_curso, en_curso→finalizado.
 * Solo admin.
 */
const cambiarEstado = async (req, res, next) => {
  try {
    const { estado } = req.body;

    const event = await Event.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    const validTransitions = {
      programado: ['en_curso'],
      en_curso:   ['finalizado'],
    };

    const allowed = validTransitions[event.estado] || [];
    if (!allowed.includes(estado)) {
      return res.status(409).json({
        success: false,
        message: `No se puede pasar de '${event.estado}' a '${estado}'. Transiciones válidas: ${allowed.join(', ') || 'ninguna'}`,
      });
    }

    event.estado = estado;
    await event.save();

    const messages = {
      en_curso:   `Evento "${event.titulo}" marcado como en curso`,
      finalizado: `Evento "${event.titulo}" finalizado`,
    };

    res.status(200).json({ success: true, data: event, message: messages[estado] });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/events/:id/cancelar
 * Cancela un evento. Solo admin. Motivo obligatorio.
 */
const cancelEvent = async (req, res, next) => {
  try {
    const { motivo } = req.body;

    const event = await Event.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    if (!['programado', 'en_curso'].includes(event.estado)) {
      return res.status(409).json({
        success: false,
        message: `No se puede cancelar un evento en estado '${event.estado}'`,
      });
    }

    event.estado              = 'cancelado';
    event.motivo_cancelacion  = motivo;
    event.cancelado_por       = req.user._id;
    event.fecha_cancelacion   = new Date();

    await event.save();

    res.status(200).json({
      success: true,
      data: event,
      message: `Evento "${event.titulo}" cancelado`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMACIONES DE ASISTENCIA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/events/:id/confirmar
 * El residente confirma, declina o delega su asistencia.
 */
const confirmAttendance = async (req, res, next) => {
  try {
    const { unit_id, respuesta, delegado_nombre, justificacion } = req.body;

    const event = await Event.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    if (!event.requiere_confirmacion) {
      return res.status(409).json({
        success: false,
        message: 'Este evento no requiere confirmación de asistencia',
      });
    }

    if (event.estado !== 'programado') {
      return res.status(409).json({
        success: false,
        message: `No se puede confirmar asistencia a un evento en estado '${event.estado}'`,
      });
    }

    if (event.fecha_limite_confirmacion && new Date() > event.fecha_limite_confirmacion) {
      return res.status(409).json({
        success: false,
        message: 'El plazo para confirmar asistencia ha vencido',
      });
    }

    if (respuesta === 'delegado' && (!delegado_nombre || delegado_nombre.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Si delega su asistencia, debe indicar el nombre del representante',
      });
    }

    if (respuesta === 'confirmado' && event.cupo_maximo > 0) {
      const confirmed = event.confirmaciones.filter(
        (c) => c.respuesta === 'confirmado' && c.unit_id.toString() !== unit_id
      ).length;

      if (confirmed >= event.cupo_maximo) {
        return res.status(409).json({
          success: false,
          message: `El evento ha alcanzado su cupo máximo (${event.cupo_maximo})`,
        });
      }
    }

    const existingIndex = event.confirmaciones.findIndex(
      (c) => c.unit_id.toString() === unit_id
    );

    const newConfirmation = {
      unit_id,
      usuario_id:      req.user._id,
      respuesta,
      delegado_nombre: respuesta === 'delegado' ? delegado_nombre : null,
      justificacion:   justificacion || null,
      fecha_respuesta: new Date(),
    };

    if (existingIndex >= 0) {
      event.confirmaciones[existingIndex] = newConfirmation;
    } else {
      event.confirmaciones.push(newConfirmation);
    }

    await event.save();

    const messages = {
      confirmado: 'Asistencia confirmada exitosamente',
      declinado:  'Inasistencia registrada',
      delegado:   `Asistencia delegada a ${delegado_nombre}`,
    };

    res.status(200).json({
      success: true,
      data: newConfirmation,
      message: messages[respuesta],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/events/:id/confirmaciones
 * Lista todas las confirmaciones de un evento. Solo admin.
 */
const getConfirmations = async (req, res, next) => {
  try {
    const event = await Event.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    })
      .populate('confirmaciones.unit_id',    'numero torre')
      .populate('confirmaciones.usuario_id', 'nombres apellidos celular')
      .lean();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    let confirmaciones = event.confirmaciones;

    if (req.query.respuesta) {
      confirmaciones = confirmaciones.filter((c) => c.respuesta === req.query.respuesta);
    }

    const resumen = {
      total:       event.confirmaciones.length,
      confirmados: event.confirmaciones.filter((c) => c.respuesta === 'confirmado').length,
      declinados:  event.confirmaciones.filter((c) => c.respuesta === 'declinado').length,
      delegados:   event.confirmaciones.filter((c) => c.respuesta === 'delegado').length,
    };

    res.status(200).json({ success: true, resumen, data: confirmaciones });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEvents,
  getUpcoming,
  getEventById,
  createEvent,
  updateEvent,
  cambiarEstado,
  cancelEvent,
  confirmAttendance,
  getConfirmations,
};