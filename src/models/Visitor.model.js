/**
 * HomeAccess - Modelo de Visitante Pre-autorizado
 * ================================================
 * El residente registra a quién espera.
 * El portero lo consulta al registrar el acceso.
 * Ruta: src/models/Visitor.model.js
 */

const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    // Unidad del residente que autoriza
    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },

    // Residente que registra la pre-autorización
    residente_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Datos del visitante
    nombre_visitante: {
      type: String,
      required: [true, 'El nombre del visitante es requerido'],
      trim: true,
    },
    doc_visitante: {
      type: String,
      trim: true,
    },

    // Tipo de visita
    tipo: {
      type: String,
      enum: ['visita', 'proveedor', 'delivery', 'empleado'],
      default: 'visita',
    },

    // Fecha en que se espera al visitante
    fecha_visita: {
      type: Date,
      required: [true, 'La fecha de visita es requerida'],
    },

    observaciones: {
      type: String,
      trim: true,
    },

    // Estado del visitante
    estado: {
      type: String,
      enum: ['pendiente', 'ingresado', 'cancelado'],
      default: 'pendiente',
    },

    // Referencia al log de acceso cuando ingresó
    access_log_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccessLog',
      default: null,
    },
  },
  { timestamps: true }
);

visitorSchema.index({ residente_id: 1, fecha_visita: -1 });
visitorSchema.index({ nombre_visitante: 1 });

const Visitor = mongoose.model('Visitor', visitorSchema);

module.exports = Visitor;
