/**
 * HomeAccess - Modelo de Reserva de Área Común
 * ==============================================
 * Registra cada solicitud de uso de un área común.
 *
 * CICLO DE VIDA DE UNA RESERVA:
 *
 *   [Residente solicita]
 *         ↓
 *    'pendiente'  ←── estado inicial siempre
 *         ↓
 *   ┌─────┴──────┐
 *   ↓            ↓
 * 'aprobada'  'rechazada'   ← admin decide
 *   ↓
 * 'cancelada'               ← residente o admin cancela antes del uso
 *
 * NOTA: Si el área tiene requiere_aprobacion=false, el sistema
 * cambia automáticamente de 'pendiente' a 'aprobada' al crear la reserva.
 */

const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complex',
      required: true,
    },

    area_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommonArea',
      required: [true, 'El área común es requerida'],
    },

    // Unidad que hace la reserva
    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'La unidad es requerida'],
    },

    // Usuario que creó la reserva (residente o propietario de esa unidad)
    solicitante_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El solicitante es requerido'],
    },

    // ─── Datos de la reserva ────────────────────────────────────────────────

    fecha: {
      type: Date,
      required: [true, 'La fecha de la reserva es requerida'],
    },

    // Franja elegida por el residente. Debe coincidir con una de las
    // franjas_horarias del área. Ej: "10:00-12:00"
    franja_horaria: {
      type: String,
      required: [true, 'La franja horaria es requerida'],
      trim: true,
    },

    num_asistentes: {
      type: Number,
      min: [1, 'Debe haber al menos 1 asistente'],
      default: 1,
    },

    // Motivo o descripción del evento (requerido para salón de eventos)
    descripcion: {
      type: String,
      trim: true,
      maxlength: [300, 'La descripción no puede superar 300 caracteres'],
    },

    // ─── Estado y gestión ───────────────────────────────────────────────────

    estado: {
      type: String,
      enum: {
        values: ['pendiente', 'aprobada', 'rechazada', 'cancelada'],
        message: 'Estado inválido',
      },
      default: 'pendiente',
    },

    // Admin que aprobó o rechazó (null si está pendiente)
    gestionado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Fecha en que el admin tomó la decisión
    fecha_gestion: {
      type: Date,
      default: null,
    },

    // Motivo del rechazo o cancelación (requerido al rechazar/cancelar)
    motivo_rechazo: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Índices ──────────────────────────────────────────────────────────────────

// Verificar disponibilidad: ¿está reservada esa área en esa fecha y franja?
reservaSchema.index({ area_id: 1, fecha: 1, franja_horaria: 1 });

// Historial de reservas por unidad
reservaSchema.index({ unit_id: 1, estado: 1 });

// Panel de admin: reservas pendientes del conjunto
reservaSchema.index({ conjunto_id: 1, estado: 1, fecha: 1 });

const Booking = mongoose.model('Booking', reservaSchema);

module.exports = Booking;