/**
 * HomeAccess - Vehicle Model
 */

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complex',
    },

    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'The residential unit is required'],
    },

    propietario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The vehicle owner is required'],
    },

    placa: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      default: null,
      match: [/^[A-Z]{3}[0-9]{2}[A-Z0-9]{1}$/, 'Invalid Colombian plate format (e.g. ABC123)'],
    },

    tipo: {
      type: String,
      enum: { values: ['carro', 'moto', 'bicicleta', 'patineta', 'otro'], message: 'Invalid vehicle type' },
      required: [true, 'Vehicle type is required'],
    },

    marca:   { type: String, trim: true, maxlength: 50 },
    modelo:  { type: String, trim: true, maxlength: 50 },
    color:   { type: String, trim: true, maxlength: 30 },
    anio:    { type: Number, min: 1970, max: new Date().getFullYear() + 1 },

    // ── Puesto de parqueadero → ahora referencia colección Parking ──
    parqueadero_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parking',   // ← ANTES era 'Unit', ahora es 'Parking'
      default: null,
    },

    activo:    { type: Boolean, default: true },
    deletedAt: { type: Date,    default: null  },
  },
  { timestamps: true }
);

vehicleSchema.index({ placa: 1, conjunto_id: 1 }, { unique: true, sparse: true });
vehicleSchema.index({ unit_id: 1, activo: 1 });
vehicleSchema.index({ parqueadero_id: 1 });
vehicleSchema.index({ placa: 1 });

vehicleSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
module.exports = Vehicle;