/**
 * HomeAccess - Controlador de Eventos
 * =====================================
 * CRUD de eventos + cancelación + confirmaciones de asistencia.
 */

const Event = require('../models/Event.model');

// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/eventos
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

    // Rango de fechas sobre fecha_inicio
    if (req.query.desde || req.query.hasta) {
      filter.fecha_inicio = {};
      if (req.query.desde) filter.fecha_inicio.$gte = new Date(req.query.desde);
      if (req.query.hasta) filter.fecha_inicio.$lte = new Date(req.query.hasta);
    }

    const [eventos, total] = await Promise.all([
      Event.find(filter)
        .populate('creado_por',    'nombres apellidos')
        .populate('cancelado_por', 'nombres apellidos')
        .populate('area_comun_id', 'nombre')
        .select('-confirmaciones') // no enviar array completo en el listado
        .sort({ fecha_inicio: 1 }) // próximos primero
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
 * GET /api/v1/eventos/proximos
 * Eventos programados o en_curso de los próximos 30 días.
 * Endpoint optimizado para el dashboard del residente.
 */
const getUpcoming = async (req, res, next) => {
  try {
    const ahora   = new Date();
    const en30dias = new Date();
    en30dias.setDate(en30dias.getDate() + 30);

    const eventos = await Event.find({
      conjunto_id:  req.user.conjunto_id,
      estado:       { $in: ['programado', 'en_curso'] },
      fecha_inicio: { $gte: ahora, $lte: en30dias },
    })
      .populate('creado_por',    'nombres apellidos')
      .populate('area_comun_id', 'nombre')
      .select('-confirmaciones')
      .sort({ fecha_inicio: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: events,
      total: eventos.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/eventos/:id
 * Detalle completo de un evento.
 * Admin ve las confirmaciones completas.
 * Residente ve su propia confirmación (si existe).
 */
const getEventById = async (req, res, next) => {
  try {
    const event = await Event.findOne({
      _id:          req.params.id,
      conjunto_id:  req.user.conjunto_id,
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
    if (!['admin'].includes(req.user.role)) {
      // Buscar si el usuario tiene alguna confirmación registrada
      const miConfirmacion = evento.confirmaciones.find(
        (c) => c.usuario_id?._id?.toString() === req.user._id.toString()
      );
      evento.confirmaciones = miConfirmacion ? [miConfirmacion] : [];
    }

    // Agregar resumen de confirmaciones para admin
    if (req.user.role === 'admin') {
      evento.resumen_confirmaciones = {
        total:       evento.confirmaciones.length,
        confirmados: evento.confirmaciones.filter((c) => c.respuesta === 'confirmado').length,
        declinados:  evento.confirmaciones.filter((c) => c.respuesta === 'declinado').length,
        delegados:   evento.confirmaciones.filter((c) => c.respuesta === 'delegado').length,
      };
    }

    res.status(200).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/eventos
 * Crea un nuevo evento. Solo admin.
 *
 * Regla de negocio:
 *   Si tipo='obligatorio' y requiere_confirmacion=true,
 *   fecha_limite_confirmacion debe ser anterior a fecha_inicio.
 */
const createEvent = async (req, res, next) => {
  try {
    const {
      titulo, descripcion, tipo, fecha_inicio, fecha_fin,
      lugar, area_comun_id, cupo_maximo,
      requiere_confirmacion, fecha_limite_confirmacion,
    } = req.body;

    // Validar fecha límite de confirmación
    if (requiere_confirmacion && fecha_limite_confirmacion) {
      if (new Date(fecha_limite_confirmacion) >= new Date(fecha_inicio)) {
        return res.status(400).json({
          success: false,
          message: 'La fecha límite de confirmación debe ser anterior a la fecha del evento',
        });
      }
    }

    // Solo los eventos obligatorios tienen sentido con confirmación
    if (tipo === 'opcional' && requiere_confirmacion) {
      return res.status(400).json({
        success: false,
        message: 'Los eventos opcionales no requieren confirmación de asistencia',
      });
    }

    const event = await Event.create({
      conjunto_id:              req.user.conjunto_id,
      titulo,
      descripcion,
      tipo,
      fecha_inicio,
      fecha_fin,
      lugar,
      area_comun_id:            area_comun_id || null,
      cupo_maximo:              cupo_maximo   || 0,
      requiere_confirmacion:    requiere_confirmacion || false,
      fecha_limite_confirmacion: fecha_limite_confirmacion || null,
      creado_por:               req.user._id,
    });

    const populated = await evento.populate('creado_por', 'nombres apellidos');

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
 * PUT /api/v1/eventos/:id
 * Actualiza un evento. Solo admin. Solo si está en estado 'programado'.
 * No se puede editar un evento en_curso, finalizado o cancelado.
 */
const updateEvent = async (req, res, next) => {
  try {
    // Campos que no se pueden modificar por esta ruta
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

    // Solo se pueden editar eventos programados
    if (event.estado !== 'programado') {
      return res.status(409).json({
        success: false,
        message: `No se puede editar un evento en estado '${event.estado}'`,
      });
    }

    // Validar fechas si se actualizan
    const nuevaInicio = req.body.fecha_inicio ? new Date(req.body.fecha_inicio) : evento.fecha_inicio;
    const nuevaFin    = req.body.fecha_fin    ? new Date(req.body.fecha_fin)    : evento.fecha_fin;

    if (nuevaFin <= nuevaInicio) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de fin debe ser posterior a la fecha de inicio',
      });
    }

    Object.assign(evento, req.body);
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
 * PATCH /api/v1/eventos/:id/estado
 * Cambia el estado del evento: en_curso | finalizado.
 * Usado para marcar el inicio y fin del evento manualmente.
 * Solo admin.
 *
 * Transiciones válidas:
 *   programado → en_curso
 *   en_curso   → finalizado
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

    // Validar transiciones permitidas
    const transicionesValidas = {
      programado: ['en_curso'],
      en_curso:   ['finalizado'],
    };

    const permitidos = transicionesValidas[event.estado] || [];
    if (!permitidos.includes(estado)) {
      return res.status(409).json({
        success: false,
        message: `No se puede pasar de '${event.estado}' a '${estado}'. Transiciones válidas: ${permitidos.join(', ') || 'ninguna'}`,
      });
    }

    event.estado = estado;
    await event.save();

    const mensajes = {
      en_curso:   `Evento "${event.titulo}" marcado como en curso`,
      finalizado: `Evento "${event.titulo}" finalizado`,
    };

    res.status(200).json({
      success: true,
      data: event,
      message: mensajes[estado],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/eventos/:id/cancelar
 * Cancela un evento. Solo admin. Motivo obligatorio.
 * Solo se pueden cancelar eventos 'programado' o 'en_curso'.
 */
const cancelEvent = async (req, res, next) => {
  try {
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El motivo de cancelación es obligatorio',
      });
    }

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

    event.estado             = 'cancelado';
    evento.motivo_cancelacion = motivo;
    evento.cancelado_por      = req.user._id;
    evento.fecha_cancelacion  = new Date();

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
 * POST /api/v1/eventos/:id/confirmar
 * El residente confirma, declina o delega su asistencia.
 * Solo para eventos con requiere_confirmacion=true.
 *
 * Si la unidad ya tenía una confirmación, la REEMPLAZA (permite cambiar
 * de opinión mientras no haya pasado fecha_limite_confirmacion).
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

    // Solo eventos que requieren confirmación
    if (!evento.requiere_confirmacion) {
      return res.status(409).json({
        success: false,
        message: 'Este evento no requiere confirmación de asistencia',
      });
    }

    // Solo se puede confirmar en eventos programados
    if (event.estado !== 'programado') {
      return res.status(409).json({
        success: false,
        message: `No se puede confirmar asistencia a un evento en estado '${event.estado}'`,
      });
    }

    // Verificar fecha límite
    if (evento.fecha_limite_confirmacion && new Date() > evento.fecha_limite_confirmacion) {
      return res.status(409).json({
        success: false,
        message: 'El plazo para confirmar asistencia ha vencido',
      });
    }

    // Validar que 'delegado' tenga nombre del representante
    if (respuesta === 'delegado' && (!delegado_nombre || delegado_nombre.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Si delega su asistencia, debe indicar el nombre del representante',
      });
    }

    // Verificar cupo si aplica (solo para confirmados)
    if (respuesta === 'confirmado' && evento.cupo_maximo > 0) {
      const confirmados = evento.confirmaciones.filter(
        (c) => c.respuesta === 'confirmado' &&
               c.unit_id.toString() !== unit_id // no contar la propia unidad si ya confirmó
      ).length;

      if (confirmados >= evento.cupo_maximo) {
        return res.status(409).json({
          success: false,
          message: `El evento ha alcanzado su cupo máximo (${evento.cupo_maximo})`,
        });
      }
    }

    // Buscar si ya existe confirmación de esta unidad para reemplazarla
    const indiceExistente = evento.confirmaciones.findIndex(
      (c) => c.unit_id.toString() === unit_id
    );

    const nuevaConfirmacion = {
      unit_id,
      usuario_id:       req.user._id,
      respuesta,
      delegado_nombre:  respuesta === 'delegado' ? delegado_nombre : null,
      justificacion:    justificacion || null,
      fecha_respuesta:  new Date(),
    };

    if (indiceExistente >= 0) {
      // Reemplazar confirmación existente
      evento.confirmaciones[indiceExistente] = nuevaConfirmacion;
    } else {
      // Agregar nueva confirmación
      evento.confirmaciones.push(nuevaConfirmacion);
    }

    await event.save();

    const mensajes = {
      confirmado: 'Asistencia confirmada exitosamente',
      declinado:  'Inasistencia registrada',
      delegado:   `Asistencia delegada a ${delegado_nombre}`,
    };

    res.status(200).json({
      success: true,
      data: nuevaConfirmacion,
      message: mensajes[respuesta],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/eventos/:id/confirmaciones
 * Lista todas las confirmaciones de un evento. Solo admin.
 * Filtro opcional: ?respuesta=confirmado|declinado|delegado
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

    let confirmaciones = evento.confirmaciones;

    // Filtro por tipo de respuesta
    if (req.query.respuesta) {
      confirmaciones = confirmaciones.filter(
        (c) => c.respuesta === req.query.respuesta
      );
    }

    const resumen = {
      total:       evento.confirmaciones.length,
      confirmados: evento.confirmaciones.filter((c) => c.respuesta === 'confirmado').length,
      declinados:  evento.confirmaciones.filter((c) => c.respuesta === 'declinado').length,
      delegados:   evento.confirmaciones.filter((c) => c.respuesta === 'delegado').length,
    };

    res.status(200).json({
      success: true,
      resumen,
      data: confirmaciones,
    });
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
