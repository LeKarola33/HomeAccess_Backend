/**
 * HomeAccess - Modelo de Vehículo
 * ================================
 * Registra los vehículos de los residentes del conjunto.
 * Un vehículo pertenece a una unidad residencial y puede tener
 * asignado un puesto de parqueadero.
 *
 * RELACIONES:
 *   Vehicle → Unit (unit_id)         el apto/casa al que pertenece
 *   Vehicle → Unit (parqueadero_id)  el puesto asignado (tipo=parqueadero en Unit)
 *   Vehicle → User (propietario_id)  el residente dueño del vehículo
 *
 * NOTA SOBRE Unit.vehiculos[]:
 *   El array vehiculos[] en Unit.model.js ya referencia este modelo.
 *   Al crear/eliminar un vehículo, el controller actualiza ese array
 *   para mantener la consistencia bidireccional.
 */

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
      required: true,
    },

    // ─── Relación con la unidad residencial ───────────────────────────────────
    // La unidad a la que pertenece el vehículo (apartamento, casa, local)
    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'La unidad residencial es requerida'],
    },

    // Propietario o residente responsable del vehículo
    propietario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El propietario del vehículo es requerido'],
    },

    // ─── Datos del vehículo ───────────────────────────────────────────────────

    placa: {
      type: String,
      required: [true, 'La placa es requerida'],
      trim: true,
      uppercase: true,
      // Formato colombiano: ABC123 (carros) o ABC12A (motos nuevas)
      match: [/^[A-Z]{3}[0-9]{2}[A-Z0-9]{1}$/, 'Formato de placa colombiana inválido (Ej: ABC123)'],
    },

    tipo: {
      type: String,
      enum: {
        values: ['carro', 'moto', 'bicicleta', 'otro'],
        message: 'Tipo de vehículo inválido',
      },
      required: [true, 'El tipo de vehículo es requerido'],
    },

    marca: {
      type: String,
      trim: true,
      maxlength: [50, 'La marca no puede superar 50 caracteres'],
    },

    modelo: {
      type: String,
      trim: true,
      maxlength: [50, 'El modelo no puede superar 50 caracteres'],
    },

    color: {
      type: String,
      trim: true,
      maxlength: [30, 'El color no puede superar 30 caracteres'],
    },

    anio: {
      type: Number,
      min: [1970, 'Año mínimo: 1970'],
      max: [new Date().getFullYear() + 1, 'Año inválido'],
    },

    // ─── Parqueadero asignado ─────────────────────────────────────────────────
    // Referencia a una Unit de tipo='parqueadero'.
    // null = sin puesto asignado (vehículo registrado pero sin parqueadero)
    parqueadero_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit', // Un parqueadero ES una unidad con tipo='parqueadero'
      default: null,
    },

    // ─── Estado ───────────────────────────────────────────────────────────────
    activo: {
      type: Boolean,
      default: true,
    },

    // Soft delete — patrón del proyecto
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Índices ──────────────────────────────────────────────────────────────────

// Placa única por conjunto (evita registrar el mismo vehículo dos veces)
vehicleSchema.index({ placa: 1, conjunto_id: 1 }, { unique: true });

// Listar vehículos de una unidad (consulta más frecuente desde el frontend)
vehicleSchema.index({ unit_id: 1, activo: 1 });

// Listar vehículos por parqueadero asignado
vehicleSchema.index({ parqueadero_id: 1 });

// Búsqueda por placa (portería identifica vehículos)
vehicleSchema.index({ placa: 1 });

// ─── Query middleware: excluir soft-deleted ───────────────────────────────────
vehicleSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
