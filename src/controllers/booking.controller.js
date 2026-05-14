/**
 * HomeAccess - Booking Controller
 * Gestión de reservas de áreas comunes
 */
const Booking     = require('../models/Booking.model');
const CommonArea  = require('../models/CommonArea.model');
const Unit        = require('../models/Unit.model');

// ── GET /bookings?area_id=&fecha=&estado= ─────────────────────────────────────
const getBookings = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.conjunto_id) filter.conjunto_id = req.user.conjunto_id;
    if (req.query.area_id)    filter.area_id      = req.query.area_id;
    if (req.query.estado)     filter.estado       = req.query.estado;
    if (req.query.fecha) {
      // Usar UTC para evitar problemas de zona horaria Colombia (UTC-5)
      const fechaStr = req.query.fecha; // 'YYYY-MM-DD'
      const start = new Date(fechaStr + 'T00:00:00.000Z');
      const end   = new Date(fechaStr + 'T23:59:59.999Z');
      // Ampliar rango para cubrir zona horaria Colombia (UTC-5 = +5 horas)
      start.setHours(start.getHours() - 5);
      end.setHours(end.getHours() + 5);
      filter.fecha_inicio = { $gte: start, $lte: end };
    }
    // Residente solo ve sus propias reservas
    if (!['admin','portero'].includes(req.user.role)) {
      filter.unit_id = { $in: req.user.unidades || [] };
    }

    const bookings = await Booking.find(filter)
      .populate('area_id',    'nombre tipo')
      .populate('unit_id',    'numero torre')
      .populate('usuario_id', 'nombres apellidos celular')
      .sort({ fecha_inicio: 1 })
      .lean();

    res.status(200).json({ success: true, data: bookings });
  } catch (e) { next(e); }
};

// ── POST /bookings ────────────────────────────────────────────────────────────
const createBooking = async (req, res, next) => {
  try {
    const { area_id, unit_id, fecha_inicio, fecha_fin, franja, observaciones } = req.body;

    if (!area_id || !unit_id || !fecha_inicio || !fecha_fin)
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });

    const area = await CommonArea.findById(area_id);
    if (!area) return res.status(404).json({ success: false, message: 'Área no encontrada' });
    if (area.estado !== 'activa')
      return res.status(409).json({ success: false, message: `El área "${area.nombre}" no está disponible` });

    // Verificar si hay conflicto de horario
    const conflicto = await Booking.findOne({
      area_id,
      estado: { $in: ['pendiente','aprobada'] },
      $or: [
        { fecha_inicio: { $lt: new Date(fecha_fin) }, fecha_fin: { $gt: new Date(fecha_inicio) } }
      ]
    });
    if (conflicto)
      return res.status(409).json({ success: false, message: 'El área ya está reservada en ese horario' });

    const estado = area.requiere_aprobacion ? 'pendiente' : 'aprobada';

    const booking = await Booking.create({
      conjunto_id:    req.user.conjunto_id || null,
      area_id,
      unit_id,
      usuario_id:     req.user._id,
      fecha_inicio:   new Date(fecha_inicio),
      fecha_fin:      new Date(fecha_fin),
      franja:         franja || '',
      observaciones:  observaciones || '',
      estado,
    });

    const populated = await booking.populate([
      { path: 'area_id',    select: 'nombre tipo' },
      { path: 'unit_id',    select: 'numero torre' },
      { path: 'usuario_id', select: 'nombres apellidos' },
    ]);

    res.status(201).json({
      success: true,
      data: populated,
      message: estado === 'aprobada'
        ? 'Reserva confirmada exitosamente'
        : 'Reserva solicitada — pendiente de aprobación',
    });
  } catch (e) { next(e); }
};

// ── PATCH /bookings/:id/estado ────────────────────────────────────────────────
const updateBookingStatus = async (req, res, next) => {
  try {
    const { estado, motivo } = req.body;
    const allowed = ['aprobada','rechazada','cancelada'];
    if (!allowed.includes(estado))
      return res.status(400).json({ success: false, message: 'Estado inválido' });

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { estado, ...(motivo && { motivo_rechazo: motivo }) },
      { new: true }
    ).populate('area_id','nombre').populate('unit_id','numero');

    if (!booking) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    res.status(200).json({ success: true, data: booking, message: `Reserva ${estado}` });
  } catch (e) { next(e); }
};

// ── DELETE /bookings/:id ──────────────────────────────────────────────────────
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Reserva no encontrada' });

    // Solo el dueño o admin puede cancelar
    const isOwner = booking.usuario_id.toString() === req.user._id.toString();
    if (!isOwner && !['admin','portero'].includes(req.user.role))
      return res.status(403).json({ success: false, message: 'Sin permisos para cancelar' });

    booking.estado = 'cancelada';
    await booking.save();
    res.status(200).json({ success: true, message: 'Reserva cancelada' });
  } catch (e) { next(e); }
};

// ── GET /bookings/area/:area_id/disponibilidad?fecha= ─────────────────────────
const getDisponibilidad = async (req, res, next) => {
  try {
    const { area_id } = req.params;
    const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date();
    const start = new Date(fecha); start.setHours(0,0,0,0);
    const end   = new Date(fecha); end.setHours(23,59,59,999);

    const reservas = await Booking.find({
      area_id,
      estado: { $in: ['pendiente','aprobada'] },
      fecha_inicio: { $gte: start, $lte: end },
    }).select('fecha_inicio fecha_fin franja estado unit_id')
      .populate('unit_id','numero torre')
      .lean();

    res.status(200).json({ success: true, data: reservas });
  } catch (e) { next(e); }
};

module.exports = { getBookings, createBooking, updateBookingStatus, cancelBooking, getDisponibilidad };