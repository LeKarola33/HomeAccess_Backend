/**
 * HomeAccess - Modelo de Evento
 * ==============================
 * Representa eventos del conjunto residencial: asambleas, jornadas de
 * mantenimiento, actividades sociales, etc.
 *
 * TIPOS:
 *   'obligatorio' → Asambleas ordinarias/extraordinarias, reuniones de
 *                   copropiedad. La asistencia puede requerirse por ley
 *                   (Ley 675 de 2001 - Propiedad Horizontal).
 *                   El sistema registra confirmaciones de asistencia.
 *
 *   'opcional'    → Actividades sociales, talleres, jornadas de reciclaje,
 *                   etc. Sin obligatoriedad de asistencia.
 *
 * CICLO DE VIDA:
 *
 *   [Admin crea]
 *       ↓
 *   'programado'  ←── estado inicial
 *       ↓
 *   'en_curso'    ←── el día del evento (puede actualizarse manualmente)
 *       ↓
 *   'finalizado'  ←── después del evento
 *
 *   En cualquier momento antes de 'en_curso':
 *   'cancelado'   ←── admin cancela con motivo obligatorio
 *
 * CONFIRMACIONES DE ASISTENCIA:
 *   Solo para eventos obligatorios. Cada unidad puede confirmar, declinar
 *   o delegar su asistencia. Se almacena en el array `confirmaciones`.
 */

const mongoose = require('mongoose');

// ─── Sub-schema: confirmación de asistencia por unidad ───────────────────────
const confirmacionSchema = new mongoose.Schema(
  {
    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
    },
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // 'confirmado' → asistirá
    // 'declinado'  → no asistirá (con justificación opcional)
    // 'delegado'   → envía representante (nombre en campo delegado_nombre)
    respuesta: {
      type: String,
      enum: ['confirmado', 'declinado', 'delegado'],
      required: true,
    },
    delegado_nombre: {
      type: String,
      trim: true,
      default: null,
    },
    justificacion: {
      type: String,
      trim: true,
      maxlength: [300, 'La justificación no puede superar 300 caracteres'],
      default: null,
    },
    fecha_respuesta: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// ─── Schema principal ─────────────────────────────────────────────────────────
const eventoSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complex',
      required: true,
    },

    // ─── Información básica ───────────────────────────────────────────────────

    titulo: {
      type: String,
      required: [true, 'El título del evento es requerido'],
      trim: true,
      maxlength: [150, 'El título no puede superar 150 caracteres'],
    },

    descripcion: {
      type: String,
      trim: true,
      maxlength: [1000, 'La descripción no puede superar 1000 caracteres'],
    },

    // Controla si la asistencia es obligatoria y si se registran confirmaciones
    tipo: {
      type: String,
      enum: {
        values: ['obligatorio', 'opcional'],
        message: 'Tipo inválido. Use: obligatorio u opcional',
      },
      required: [true, 'El tipo de evento es requerido'],
    },

    // ─── Fecha y lugar ────────────────────────────────────────────────────────

    fecha_inicio: {
      type: Date,
      required: [true, 'La fecha de inicio es requerida'],
    },

    fecha_fin: {
      type: Date,
      required: [true, 'La fecha de fin es requerida'],
    },

    // Lugar físico del evento. Puede ser un área común del conjunto u otro lugar.
    // Ej: "Salón de Eventos", "Plazoleta central", "Virtual - Zoom"
    lugar: {
      type: String,
      trim: true,
      required: [true, 'El lugar del evento es requerido'],
      maxlength: [200, 'El lugar no puede superar 200 caracteres'],
    },

    // Referencia opcional al área común si el evento ocurre en una
    area_comun_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommonArea',
      default: null,
    },

    // ─── Configuración ────────────────────────────────────────────────────────

    // Cupo máximo de asistentes (0 = sin límite)
    cupo_maximo: {
      type: Number,
      default: 0,
      min: [0, 'El cupo no puede ser negativo'],
    },

    // Solo para eventos obligatorios: ¿se requiere confirmación previa?
    requiere_confirmacion: {
      type: Boolean,
      default: false,
    },

    // Fecha límite para confirmar asistencia
    fecha_limite_confirmacion: {
      type: Date,
      default: null,
    },

    // ─── Estado del evento ────────────────────────────────────────────────────

    estado: {
      type: String,
      enum: {
        values: ['programado', 'en_curso', 'finalizado', 'cancelado'],
        message: 'Estado inválido',
      },
      default: 'programado',
    },

    // Motivo de cancelación (obligatorio al cancelar)
    motivo_cancelacion: {
      type: String,
      trim: true,
      default: null,
    },

    // ─── Auditoría ────────────────────────────────────────────────────────────

    // Admin que creó el evento
    creado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Admin que canceló el evento (si aplica)
    cancelado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    fecha_cancelacion: {
      type: Date,
      default: null,
    },

    // ─── Confirmaciones de asistencia ─────────────────────────────────────────
    // Solo relevante para eventos con requiere_confirmacion=true.
    // Una entrada por unidad (se actualiza si la unidad cambia su respuesta).
    confirmaciones: [confirmacionSchema],

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Validación a nivel de schema ─────────────────────────────────────────────
/**
 * Verifica que fecha_fin sea posterior a fecha_inicio.
 * Se ejecuta en save() y en findOneAndUpdate con runValidators:true.
 */
eventoSchema.pre('validate', function (next) {
  if (this.fecha_fin && this.fecha_inicio && this.fecha_fin <= this.fecha_inicio) {
    this.invalidate('fecha_fin', 'La fecha de fin debe ser posterior a la fecha de inicio');
  }
  next();
});

// ─── Índices ──────────────────────────────────────────────────────────────────

// Eventos próximos del conjunto (consulta más frecuente del panel residente)
eventoSchema.index({ conjunto_id: 1, fecha_inicio: 1, estado: 1 });

// Filtro por tipo (obligatorio/opcional)
eventoSchema.index({ conjunto_id: 1, tipo: 1, estado: 1 });

// ─── Query middleware: excluir soft-deleted ───────────────────────────────────
eventoSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const Event = mongoose.model('Event', eventoSchema);

module.exports = Event;