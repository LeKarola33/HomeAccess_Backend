/**
 * HomeAccess - Controlador de Áreas Comunes
 * ==========================================
 * CRUD de áreas + gestión de reservas (aprobar/rechazar/cancelar)
 * + bloqueo de unidades + control de estado del área.
 */

const CommonArea = require('../models/CommonArea.model');
const Booking = require('../models/Booking.model');

// ─────────────────────────────────────────────────────────────────────────────
// ÁREAS COMUNES — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/areas
 * Lista todas las áreas comunes del conjunto.
 * Residentes: solo ven las activas. Admin: ve todas.
 */
const getAreas = async (req, res, next) => {
  try {
    const filter = { conjunto_id: req.user.conjunto_id };

    // Los residentes solo ven áreas disponibles
    if (!['admin'].includes(req.user.role)) {
      filter.estado = 'activa';
    }

    const areas = await CommonArea.find(filter)
      .select('-unidades_bloqueadas') // no exponer lista de bloqueados a residentes
      .sort({ nombre: 1 })
      .lean();

    res.status(200).json({ success: true, data: areas, total: areas.length });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/areas/:id
 * Detalle de un área. Admin ve campos completos incluyendo unidades bloqueadas.
 */
const getAreaById = async (req, res, next) => {
  try {
    let query = CommonArea.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id, // guard multitenant
    });

    // Solo admin ve la lista de unidades bloqueadas
    if (req.user.role === 'admin') {
      query = query.populate('unidades_bloqueadas.unit_id', 'numero torre');
    } else {
      query = query.select('-unidades_bloqueadas');
    }

    const area = await query.lean();

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    res.status(200).json({ success: true, data: area });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/areas
 * Crea un área común. Solo admin.
 */
const createArea = async (req, res, next) => {
  try {
    const area = await CommonArea.create({
      ...req.body,
      conjunto_id: req.user.conjunto_id,
    });

    res.status(201).json({
      success: true,
      data: area,
      message: `Área "${area.nombre}" creada exitosamente`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/areas/:id
 * Actualiza datos de un área. Solo admin.
 * No se puede cambiar conjunto_id ni unidades_bloqueadas por esta ruta.
 */
const updateArea = async (req, res, next) => {
  try {
    // Campos que no se modifican por esta ruta
    const restricted = ['conjunto_id', 'unidades_bloqueadas', 'deletedAt'];
    restricted.forEach((f) => delete req.body[f]);

    const area = await CommonArea.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    res.status(200).json({ success: true, data: area, message: 'Área actualizada' });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/areas/:id/estado
 * Cambia el estado global del área: activa | sin_servicio | mantenimiento.
 * Casos de uso:
 *   - Piscina en mantenimiento: estado='mantenimiento', fecha_reapertura='2025-08-01'
 *   - Cerrar temporalmente: estado='sin_servicio', motivo_bloqueo='Limpieza general'
 *   - Reabrir: estado='activa'
 */
const cambiarEstadoArea = async (req, res, next) => {
  try {
    const { estado, motivo_bloqueo, fecha_reapertura } = req.body;

    const area = await CommonArea.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      {
        estado,
        motivo_bloqueo: motivo_bloqueo || null,
        fecha_reapertura: fecha_reapertura || null,
      },
      { new: true, runValidators: true }
    );

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    const mensajes = {
      activa: `Área "${area.nombre}" reactivada`,
      sin_servicio: `Área "${area.nombre}" marcada sin servicio`,
      mantenimiento: `Área "${area.nombre}" en mantenimiento`,
    };

    res.status(200).json({
      success: true,
      data: area,
      message: mensajes[estado] || 'Estado actualizado',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/areas/:id/bloquear-unidad
 * Bloquea una unidad específica para que no pueda reservar este área.
 * Caso típico: piscina bloqueada por mora de cuota de administración.
 */
const bloquearUnidad = async (req, res, next) => {
  try {
    const { unit_id, motivo } = req.body;

    const area = await CommonArea.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    // Verificar si ya está bloqueada para evitar duplicados
    const yaExiste = area.unidades_bloqueadas.some(
      (b) => b.unit_id.toString() === unit_id
    );

    if (yaExiste) {
      return res.status(409).json({
        success: false,
        message: 'Esta unidad ya está bloqueada para este área',
      });
    }

    area.unidades_bloqueadas.push({
      unit_id,
      motivo: motivo || 'Bloqueado por administración',
      bloqueado_por: req.user._id,
      fecha_bloqueo: new Date(),
    });

    await area.save();

    res.status(200).json({
      success: true,
      message: `Unidad bloqueada para "${area.nombre}"`,
      data: area.unidades_bloqueadas,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/areas/:id/desbloquear-unidad
 * Elimina el bloqueo de una unidad específica para este área.
 */
const desbloquearUnidad = async (req, res, next) => {
  try {
    const { unit_id } = req.body;

    const area = await CommonArea.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    const longitudAntes = area.unidades_bloqueadas.length;
    area.unidades_bloqueadas = area.unidades_bloqueadas.filter(
      (b) => b.unit_id.toString() !== unit_id
    );

    if (area.unidades_bloqueadas.length === longitudAntes) {
      return res.status(404).json({
        success: false,
        message: 'Esta unidad no estaba bloqueada',
      });
    }

    await area.save();

    res.status(200).json({
      success: true,
      message: 'Unidad desbloqueada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESERVAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/areas/:id/reservas
 * Lista reservas de un área. Admin ve todas; residente solo las de su unidad.
 * Soporta filtro por ?estado=pendiente&fecha=2025-08-01
 */
const getBookings = async (req, res, next) => {
  try {
    const filter = {
      area_id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    };

    // Residentes solo ven sus propias reservas
    if (!['admin'].includes(req.user.role)) {
      filter.solicitante_id = req.user._id;
    }

    if (req.query.estado) filter.estado = req.query.estado;

    // Filtro por fecha exacta (día completo)
    if (req.query.fecha) {
      const inicio = new Date(req.query.fecha);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(req.query.fecha);
      fin.setHours(23, 59, 59, 999);
      filter.fecha = { $gte: inicio, $lte: fin };
    }

    const reservas = await Booking.find(filter)
      .populate('unit_id', 'numero torre')
      .populate('solicitante_id', 'nombres apellidos')
      .populate('gestionado_por', 'nombres apellidos')
      .sort({ fecha: 1, franja_horaria: 1 })
      .lean();

    res.status(200).json({ success: true, data: reservas, total: reservas.length });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/areas/:id/disponibilidad
 * Retorna las franjas disponibles (no reservadas) para una fecha dada.
 * Query param requerido: ?fecha=2025-08-15
 */
const getAvailability = async (req, res, next) => {
  try {
    if (!req.query.fecha) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro fecha es requerido (?fecha=YYYY-MM-DD)',
      });
    }

    const area = await CommonArea.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    // Si el área no está activa, no hay disponibilidad
    if (area.estado !== 'activa') {
      return res.status(200).json({
        success: true,
        disponible: false,
        motivo: area.motivo_bloqueo || `Área en estado: ${area.estado}`,
        franjas: [],
      });
    }

    // Buscar franjas ya reservadas (aprobadas o pendientes) en esa fecha
    const inicio = new Date(req.query.fecha);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(req.query.fecha);
    fin.setHours(23, 59, 59, 999);

    const reservasOcupadas = await Booking.find({
      area_id: req.params.id,
      fecha: { $gte: inicio, $lte: fin },
      estado: { $in: ['pendiente', 'aprobada'] }, // canceladas y rechazadas liberan la franja
    }).select('franja_horaria');

    const franjasOcupadas = reservasOcupadas.map((r) => r.franja_horaria);

    const franjas = area.franjas_horarias.map((franja) => ({
      franja,
      disponible: !franjasOcupadas.includes(franja),
    }));

    res.status(200).json({
      success: true,
      disponible: true,
      area: area.nombre,
      fecha: req.query.fecha,
      franjas,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/areas/:id/reservas
 * Crea una nueva solicitud de reserva.
 * Validaciones:
 *   1. El área debe estar activa
 *   2. La unidad no debe estar bloqueada para este área
 *   3. La franja no debe estar ocupada en esa fecha
 *   4. La unidad no supera el límite de reservas activas
 *   5. La fecha debe cumplir la anticipación mínima del área
 */
const createBooking = async (req, res, next) => {
  try {
    const area = await CommonArea.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!area) {
      return res.status(404).json({ success: false, message: 'Área no encontrada' });
    }

    // ── Validación 1: área activa ──────────────────────────────────────────
    if (area.estado !== 'activa') {
      return res.status(409).json({
        success: false,
        message: `El área no está disponible: ${area.motivo_bloqueo || area.estado}`,
      });
    }

    const { unit_id, fecha, franja_horaria, num_asistentes, descripcion } = req.body;

    // ── Validación 2: unidad no bloqueada ──────────────────────────────────
    const unidadBloqueada = area.unidades_bloqueadas.find(
      (b) => b.unit_id.toString() === unit_id
    );
    if (unidadBloqueada) {
      return res.status(403).json({
        success: false,
        message: `Su unidad no puede reservar este área. Motivo: ${unidadBloqueada.motivo}`,
      });
    }

    // ── Validación 3: franja disponible ────────────────────────────────────
    const fechaReserva = new Date(fecha);
    const inicioDia = new Date(fecha);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setHours(23, 59, 59, 999);

    const franjaOcupada = await Booking.findOne({
      area_id: req.params.id,
      fecha: { $gte: inicioDia, $lte: finDia },
      franja_horaria,
      estado: { $in: ['pendiente', 'aprobada'] },
    });

    if (franjaOcupada) {
      return res.status(409).json({
        success: false,
        message: `La franja ${franja_horaria} ya está reservada para esta fecha`,
      });
    }

    // ── Validación 4: límite de reservas activas por unidad ─────────────────
    const reservasActivas = await Booking.countDocuments({
      area_id: req.params.id,
      unit_id,
      estado: { $in: ['pendiente', 'aprobada'] },
    });

    if (reservasActivas >= area.max_reservas_activas_por_unidad) {
      return res.status(409).json({
        success: false,
        message: `Su unidad ya tiene el máximo de reservas activas permitidas (${area.max_reservas_activas_por_unidad})`,
      });
    }

    // ── Validación 5: anticipación mínima ──────────────────────────────────
    const horasAnticipacion =
      (fechaBooking.getTime() - Date.now()) / (1000 * 60 * 60);

    if (horasAnticipacion < area.anticipacion_minima_horas) {
      return res.status(409).json({
        success: false,
        message: `Debe reservar con al menos ${area.anticipacion_minima_horas} horas de anticipación`,
      });
    }

    // ── Crear reserva ──────────────────────────────────────────────────────
    // Si el área no requiere aprobación, se confirma directamente
    const estadoInicial = area.requiere_aprobacion ? 'pendiente' : 'aprobada';

    const reserva = await Booking.create({
      conjunto_id: req.user.conjunto_id,
      area_id: req.params.id,
      unit_id,
      solicitante_id: req.user._id,
      fecha: fechaReserva,
      franja_horaria,
      num_asistentes,
      descripcion,
      estado: estadoInicial,
    });

    const mensaje =
      estadoInicial === 'aprobada'
        ? 'Reserva confirmada automáticamente'
        : 'Solicitud enviada. Pendiente de aprobación por administración';

    res.status(201).json({ success: true, data: reserva, message: mensaje });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/areas/:areaId/reservas/:reservaId/aprobar
 * Admin aprueba una reserva pendiente.
 */
const approveBooking = async (req, res, next) => {
  try {
    const reserva = await Booking.findOneAndUpdate(
      {
        _id: req.params.reservaId,
        area_id: req.params.areaId,
        conjunto_id: req.user.conjunto_id,
        estado: 'pendiente', // solo se pueden aprobar las pendientes
      },
      {
        estado: 'aprobada',
        gestionado_por: req.user._id,
        fecha_gestion: new Date(),
        motivo_rechazo: null,
      },
      { new: true }
    )
      .populate('unit_id', 'numero torre')
      .populate('solicitante_id', 'nombres apellidos');

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada o no está en estado pendiente',
      });
    }

    res.status(200).json({
      success: true,
      data: reserva,
      message: 'Reserva aprobada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/areas/:areaId/reservas/:reservaId/rechazar
 * Admin rechaza una reserva pendiente. Motivo requerido.
 */
const rejectBooking = async (req, res, next) => {
  try {
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El motivo del rechazo es requerido',
      });
    }

    const reserva = await Booking.findOneAndUpdate(
      {
        _id: req.params.reservaId,
        area_id: req.params.areaId,
        conjunto_id: req.user.conjunto_id,
        estado: 'pendiente',
      },
      {
        estado: 'rechazada',
        gestionado_por: req.user._id,
        fecha_gestion: new Date(),
        motivo_rechazo: motivo,
      },
      { new: true }
    );

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada o no está en estado pendiente',
      });
    }

    res.status(200).json({
      success: true,
      data: reserva,
      message: 'Reserva rechazada',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/areas/:areaId/reservas/:reservaId/cancelar
 * Cancela una reserva. Admin puede cancelar cualquiera; residente solo la suya.
 */
const cancelBooking = async (req, res, next) => {
  try {
    const { motivo } = req.body;

    const filtro = {
      _id: req.params.reservaId,
      area_id: req.params.areaId,
      conjunto_id: req.user.conjunto_id,
      estado: { $in: ['pendiente', 'aprobada'] }, // solo se cancelan activas
    };

    // Residentes solo pueden cancelar sus propias reservas
    if (req.user.role !== 'admin') {
      filtro.solicitante_id = req.user._id;
    }

    const reserva = await Booking.findOneAndUpdate(
      filtro,
      {
        estado: 'cancelada',
        gestionado_por: req.user._id,
        fecha_gestion: new Date(),
        motivo_rechazo: motivo || 'Cancelada por el solicitante',
      },
      { new: true }
    );

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada o no se puede cancelar',
      });
    }

    res.status(200).json({
      success: true,
      data: reserva,
      message: 'Reserva cancelada',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Áreas
  getAreas,
  getAreaById,
  createArea,
  updateArea,
  cambiarEstadoArea,
  bloquearUnidad,
  desbloquearUnidad,
  // Reservas
  getBookings,
  getAvailability,
  createBooking,
  approveBooking,
  rejectBooking,
  cancelBooking,
};
