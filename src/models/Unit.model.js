/**
 * HomeAccess - Modelo de Unidad Residencial
 * ==========================================
 * Representa cada apartamento, casa o local del conjunto.
 */

const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    // Ej: "301", "Casa 5", "Local 2"
    numero: {
      type: String,
      required: [true, 'El número de unidad es requerido'],
      trim: true,
    },
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
      required: true,
    },
    torre: {
      type: String,
      trim: true,
    },
    piso: {
      type: Number,
    },
    tipo: {
      type: String,
      enum: ['apartamento', 'casa', 'local', 'bodega', 'parqueadero'],
      default: 'apartamento',
    },
    estado: {
      type: String,
      enum: ['ocupado', 'desocupado', 'en_mantenimiento', 'en_venta'],
      default: 'desocupado',
    },

    // --- Relaciones con usuarios ---
    propietario_actual: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    residentes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],

    // Historial de propietarios para trazabilidad
    historial_propietarios: [{
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      fecha_inicio: Date,
      fecha_fin: Date,
    }],

    // Mascotas registradas (solo para presencia, sin datos sensibles)
    mascotas: [{
      nombre: String,
      especie: String,
      raza: String,
    }],

    vehiculos: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
    }],
  },
  { timestamps: true }
);

// Número de unidad único dentro del mismo conjunto
unitSchema.index({ numero: 1, conjunto_id: 1 }, { unique: true });
unitSchema.index({ estado: 1 });

const Unit = mongoose.model('Unit', unitSchema);

module.exports = Unit;
