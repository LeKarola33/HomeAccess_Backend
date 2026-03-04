/**
 * HomeAccess - Modelo de Área Común
 * ==================================
 * Representa cada área común del conjunto: salón de eventos, piscina,
 * BBQ, cancha, gimnasio, etc.
 *
 * LÓGICA DE NEGOCIO IMPORTANTE:
 *   - Un área puede estar activa, en mantenimiento o eliminada (soft delete).
 *   - La piscina (y cualquier área) puede bloquearse por unidad específica:
 *     si unit_id está en `unidades_bloqueadas`, esa unidad no puede reservar.
 *   - El campo `requiere_aprobacion` controla si las reservas quedan
 *     en estado 'pendiente' (admin aprueba) o se confirman automáticamente.
 *   - `franjas_horarias` define los bloques disponibles para reservar
 *     (ej: ["08:00-10:00", "10:00-12:00", "14:00-16:00"]).
 */

const mongoose = require('mongoose');

const areaComúnSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
      required: true,
    },

    // ─── Identificación ────────────────────────────────────────────────────────

    nombre: {
      type: String,
      required: [true, 'El nombre del área es requerido'],
      trim: true,
      maxlength: [80, 'El nombre no puede superar 80 caracteres'],
    },

    // Categoría del área (define reglas de negocio en el frontend)
    tipo: {
      type: String,
      enum: {
        values: ['salon_eventos', 'piscina', 'bbq', 'cancha', 'gimnasio', 'parque', 'otro'],
        message: 'Tipo de área inválido',
      },
      required: [true, 'El tipo de área es requerido'],
    },

    descripcion: {
      type: String,
      trim: true,
      maxlength: [500, 'La descripción no puede superar 500 caracteres'],
    },

    capacidad_maxima: {
      type: Number,
      min: [1, 'La capacidad mínima es 1 persona'],
      default: 20,
    },

    // ─── Estado del área ───────────────────────────────────────────────────────

    // Estado GLOBAL del área. Independiente del estado de cada reserva.
    // 'activa'        → acepta nuevas reservas
    // 'sin_servicio'  → no acepta reservas (ej: piscina en mantenimiento temporal)
    // 'mantenimiento' → bloqueo más formal con fecha estimada de reapertura
    estado: {
      type: String,
      enum: {
        values: ['activa', 'sin_servicio', 'mantenimiento'],
        message: 'Estado inválido. Use: activa, sin_servicio o mantenimiento',
      },
      default: 'activa',
    },

    // Fecha estimada de reapertura (opcional, para estado 'mantenimiento')
    fecha_reapertura: {
      type: Date,
      default: null,
    },

    // Motivo del bloqueo/mantenimiento (visible para residentes)
    motivo_bloqueo: {
      type: String,
      trim: true,
      default: null,
    },

    // ─── Configuración de reservas ─────────────────────────────────────────────

    // true  → el admin debe aprobar/rechazar cada reserva manualmente
    // false → la reserva se confirma automáticamente si el horario está libre
    requiere_aprobacion: {
      type: Boolean,
      default: true,
    },

    // Anticipación mínima para reservar (en horas).
    // Ej: 24 → no se puede reservar con menos de 24h de antelación
    anticipacion_minima_horas: {
      type: Number,
      default: 24,
      min: [0, 'La anticipación mínima no puede ser negativa'],
    },

    // Límite de reservas activas por unidad al mismo tiempo.
    // Ej: 1 → una unidad no puede tener 2 reservas pendientes/confirmadas a la vez
    max_reservas_activas_por_unidad: {
      type: Number,
      default: 1,
      min: [1, 'El máximo debe ser al menos 1'],
    },

    // Franjas horarias disponibles. Cada franja es un string "HH:MM-HH:MM".
    // El residente elige una de estas al crear la reserva.
    // Ej: ["08:00-10:00", "10:00-12:00", "14:00-16:00", "16:00-18:00"]
    franjas_horarias: {
      type: [String],
      default: ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00'],
    },

    // ─── Bloqueo por unidad ────────────────────────────────────────────────────
    // Lista de unidades que NO pueden reservar este área (ej: piscina bloqueada
    // por mora en cuota de administración).
    // El admin agrega/quita unidades de esta lista con PATCH /:id/bloquear-unidad
    unidades_bloqueadas: [
      {
        unit_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Unit',
          required: true,
        },
        motivo: {
          type: String,
          trim: true,
          default: 'Bloqueado por administración',
        },
        bloqueado_por: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User', // admin que aplicó el bloqueo
        },
        fecha_bloqueo: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ─── Soft delete ───────────────────────────────────────────────────────────
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Índices ──────────────────────────────────────────────────────────────────

// Consulta principal: áreas activas de un conjunto
areaComúnSchema.index({ conjunto_id: 1, estado: 1 });

// Nombre único por conjunto (no puede haber dos "Piscina" en el mismo conjunto)
areaComúnSchema.index({ nombre: 1, conjunto_id: 1 }, { unique: true });

// ─── Query middleware: excluir soft-deleted ───────────────────────────────────
areaComúnSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const CommonArea = mongoose.model('CommonArea', areaComúnSchema);

module.exports = CommonArea;
