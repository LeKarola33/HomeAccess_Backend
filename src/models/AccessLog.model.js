/**
 * HomeAccess - Modelo de Log de Acceso
 * =====================================
 * Registra ingresos y salidas de residentes, visitantes y proveedores.
 * Dato crítico de seguridad - NO se puede modificar ni eliminar (append-only).
 * Retención de 2 años según política (TTL Index).
 */

const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema(
  {
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
      required: true,
    },

    // Tipo de persona que accede
    tipo_persona: {
      type: String,
      enum: ['residente', 'visitante', 'proveedor', 'empleado', 'delivery'],
      required: true,
    },

    // Referencia al usuario si está registrado en el sistema
    persona_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null si es visitante no registrado
    },

    // Datos del visitante no registrado
    nombre_visitante: { type: String, trim: true },
    // Documento solo con consentimiento explícito del visitante
    doc_visitante: { type: String, trim: true },

    // ¿A dónde va?
    unit_destino: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },

    // ¿Quién autorizó el ingreso?
    autorizado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    tipo_acceso: {
      type: String,
      enum: ['entrada', 'salida'],
      required: true,
    },

    // Portería por donde ingresa (Ej: "Principal", "Parqueadero", "Peatonal")
    porteria: {
      type: String,
      required: true,
    },

    // Método de identificación usado
    metodo: {
      type: String,
      enum: ['manual', 'QR', 'tarjeta', 'biometrico', 'llamada'],
      default: 'manual',
    },

    qr_code: { type: String },

    // Referencia al NVR para las cámaras (NO se almacena la URL del video)
    camara_ref: { type: String },

    // Portero que registró el acceso
    portero_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    observaciones: { type: String },

    // Timestamp exacto del acceso (campo principal de índice)
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    // No se usa timestamps de Mongoose porque usamos campo 'timestamp' explícito
    // Los logs de acceso son inmutables (solo insert, nunca update/delete)
    versionKey: false,
  }
);

// ==========================================
// ÍNDICES
// ==========================================
// Logs recientes primero (consulta más frecuente)
accessLogSchema.index({ timestamp: -1 });

// TTL Index: elimina registros automáticamente después de 2 años
// (2 años = 63072000 segundos) - Retención de datos según política
accessLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 63072000, name: 'ttl_2_years' }
);

// Búsqueda por conjunto + período de tiempo
accessLogSchema.index({ conjunto_id: 1, timestamp: -1 });

// Búsqueda por unidad (historial de accesos a un apartamento)
accessLogSchema.index({ unit_destino: 1, timestamp: -1 });

// Búsqueda por persona (historial de movimientos de un residente)
accessLogSchema.index({ persona_id: 1, timestamp: -1 });

const AccessLog = mongoose.model('AccessLog', accessLogSchema);

module.exports = AccessLog;
