/**
 * HomeAccess - Vehicle Model
 * ===========================
 * Registers vehicles belonging to residents of the complex.
 * A vehicle belongs to a residential unit and can have
 * a parking spot assigned to it.
 *
 * RELATIONSHIPS:
 *   Vehicle → Unit (unit_id)          the apartment/house it belongs to
 *   Vehicle → Unit (parqueadero_id)   the assigned spot (Unit with tipo='parqueadero')
 *   Vehicle → User (propietario_id)   the resident who owns the vehicle
 *
 * NOTE ON Unit.vehiculos[]:
 *   The vehiculos[] array in Unit.model.js already references this model.
 *   When creating/deleting a vehicle, the controller updates that array
 *   to maintain bidirectional consistency.
 */

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complex',
      required: true,
    },

    // ─── Residential unit relationship ────────────────────────────────────────
    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'The residential unit is required'],
    },

    // Resident responsible for the vehicle
    propietario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The vehicle owner is required'],
    },

    // ─── Vehicle data ─────────────────────────────────────────────────────────

    placa: {
      type: String,
      // Required only for: carro, moto
      // Optional for: bicicleta, patineta, otro (no plate in Colombia)
      required: false,
      trim: true,
      uppercase: true,
      default: null,
      // Colombian format: ABC123 (cars) or ABC12A (new motorcycles)
      // Only validated when present
      match: [/^[A-Z]{3}[0-9]{2}[A-Z0-9]{1}$/, 'Invalid Colombian plate format (e.g. ABC123)'],
    },

    tipo: {
      type: String,
      enum: {
        values: ['carro', 'moto', 'bicicleta', 'patineta', 'otro'],
        message: 'Invalid vehicle type',
      },
      required: [true, 'Vehicle type is required'],
    },

    marca: {
      type: String,
      trim: true,
      maxlength: [50, 'Brand cannot exceed 50 characters'],
    },

    modelo: {
      type: String,
      trim: true,
      maxlength: [50, 'Model cannot exceed 50 characters'],
    },

    color: {
      type: String,
      trim: true,
      maxlength: [30, 'Color cannot exceed 30 characters'],
    },

    anio: {
      type: Number,
      min: [1970, 'Minimum year: 1970'],
      max: [new Date().getFullYear() + 1, 'Invalid year'],
    },

    // ─── Assigned parking spot ────────────────────────────────────────────────
    // References a Unit with tipo='parqueadero'.
    // null = no spot assigned (vehicle registered but without parking)
    parqueadero_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      default: null,
    },

    // ─── Status ───────────────────────────────────────────────────────────────
    activo: {
      type: Boolean,
      default: true,
    },

    // Soft delete — project pattern
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Unique plate per complex (prevents duplicate vehicle registration)
// sparse: true allows multiple null plates (bicicletas/patinetas without plate)
vehicleSchema.index({ placa: 1, conjunto_id: 1 }, { unique: true, sparse: true });

// List vehicles by unit (most frequent query)
vehicleSchema.index({ unit_id: 1, activo: 1 });

// List vehicles by assigned spot
vehicleSchema.index({ parqueadero_id: 1 });

// Plate search (security booth identifies vehicles by plate)
vehicleSchema.index({ placa: 1 });

// ─── Query middleware: exclude soft-deleted ───────────────────────────────────
vehicleSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;