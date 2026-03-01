/**
 * HomeAccess - Modelo de Conjunto Residencial
 * =============================================
 * Entidad raíz del sistema. Cada conjunto es un "tenant" independiente:
 * todos los demás modelos (User, Unit, AccessLog, Package) pertenecen
 * a un Conjunto mediante conjunto_id.
 *
 * Ley 1581 de 2012: se registra NIT/razón social del responsable del
 * tratamiento de datos (la administración del conjunto).
 */

const mongoose = require('mongoose');

const conjuntoSchema = new mongoose.Schema(
  {
    // ─── Identificación ───────────────────────────────────────────────────────

    nombre: {
      type: String,
      required: [true, 'El nombre del conjunto es requerido'],
      trim: true,
      minlength: [3, 'El nombre debe tener mínimo 3 caracteres'],
      maxlength: [120, 'El nombre no puede superar 120 caracteres'],
    },

    // NIT del conjunto o de la copropiedad (formato colombiano sin dígito de
    // verificación, ej: "900123456"). Único en toda la BD.
    nit: {
      type: String,
      required: [true, 'El NIT es requerido'],
      unique: true,
      trim: true,
      match: [/^\d{6,10}$/, 'Formato de NIT inválido (solo dígitos, 6-10 caracteres)'],
    },

    // ─── Dirección y ubicación ────────────────────────────────────────────────

    direccion: {
      type: String,
      required: [true, 'La dirección es requerida'],
      trim: true,
    },

    ciudad: {
      type: String,
      required: [true, 'La ciudad es requerida'],
      trim: true,
      default: 'Cali',
    },

    departamento: {
      type: String,
      trim: true,
      default: 'Valle del Cauca',
    },

    // ─── Contacto de la administración ───────────────────────────────────────

    // Correo oficial de la administración (recibe notificaciones del sistema)
    email_admin: {
      type: String,
      required: [true, 'El email de administración es requerido'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Formato de email inválido'],
    },

    telefono: {
      type: String,
      trim: true,
    },

    // ─── Configuración del conjunto ───────────────────────────────────────────

    // Número total de unidades (referencial, no es conteo en tiempo real)
    total_unidades: {
      type: Number,
      default: 0,
      min: [0, 'El total de unidades no puede ser negativo'],
    },

    // Nombre de la(s) portería(s). Cada acceso-log referencia una de estas.
    // Ej: ["Principal", "Parqueadero", "Peatonal Norte"]
    porterias: {
      type: [String],
      default: ['Principal'],
      validate: {
        validator: (arr) => arr.length >= 1,
        message: 'El conjunto debe tener al menos una portería',
      },
    },

    // Plan contratado: controla qué módulos están habilitados en el frontend.
    // 'basico'   → acceso + paquetes
    // 'estandar' → + visitantes QR
    // 'premium'  → + analíticas + notificaciones push
    plan: {
      type: String,
      enum: {
        values: ['basico', 'estandar', 'premium'],
        message: 'Plan inválido. Use: basico, estandar o premium',
      },
      default: 'basico',
    },

    // ─── Estado y auditoría ───────────────────────────────────────────────────

    activo: {
      type: Boolean,
      default: true,
    },

    // Soft delete — alineado con el mismo patrón de User.model.js
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    // createdAt y updatedAt automáticos (misma convención que los demás modelos)
    timestamps: true,
  }
);

// ─── Índices ──────────────────────────────────────────────────────────────────

// NIT único (búsqueda en login de administradores y en seeds)
conjuntoSchema.index({ nit: 1 }, { unique: true });

// Email único global (notificaciones del sistema)
conjuntoSchema.index({ email_admin: 1 }, { unique: true });

// Consultas por estado activo (listado en panel de superadmin futuro)
conjuntoSchema.index({ activo: 1 });

// ─── Query middleware: excluir soft-deleted ───────────────────────────────────
/**
 * Mismo patrón que User.model.js: los queries normales nunca devuelven
 * conjuntos eliminados. Para incluirlos usar .setOptions({ includeDeleted: true }).
 */
conjuntoSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const Conjunto = mongoose.model('Conjunto', conjuntoSchema);

module.exports = Conjunto;
