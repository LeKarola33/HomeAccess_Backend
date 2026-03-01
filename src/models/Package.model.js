/**
 * HomeAccess - Modelo de Paquetes y Correspondencia
 * ==================================================
 * Controla paquetes, sobres y encomiendas recibidas en portería.
 */

const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
      required: true,
    },
    unit_destino: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
    },
    destinatario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    remitente: { type: String, trim: true },
    transportadora: { type: String, trim: true }, // Ej: Servientrega, Coordinadora
    guia: { type: String, trim: true },

    tipo: {
      type: String,
      enum: ['paquete', 'sobre', 'documento', 'perecedero', 'otro'],
      default: 'paquete',
    },
    descripcion: { type: String },
    foto_url: { type: String }, // URL al archivo en Storage

    // Portero que recibió el paquete
    recibido_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fecha_recepcion: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // Datos de entrega al residente
    entregado_a: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    fecha_entrega: { type: Date },
    firma_digital: { type: String }, // Hash de la firma

    estado: {
      type: String,
      enum: ['en_porteria', 'entregado', 'devuelto', 'perdido'],
      default: 'en_porteria',
    },

    // Contador para evitar spam de notificaciones
    notificaciones_enviadas: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Paquetes pendientes por unidad (consulta más frecuente en portería)
packageSchema.index({ unit_destino: 1, estado: 1 });
packageSchema.index({ conjunto_id: 1, estado: 1 });

const Package = mongoose.model('Package', packageSchema);

module.exports = Package;
