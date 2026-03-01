/**
 * HomeAccess - Modelo de Usuario
 * ==============================
 * Gestiona propietarios, residentes, administradores y porteros.
 * Cumple con Ley 1581 de 2012: incluye campos de consentimiento y soft delete.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // --- Identificación ---
    cedula: {
      type: String,
      required: [true, 'La cédula es requerida'],
      trim: true,
    },
    tipo_documento: {
      type: String,
      enum: ['CC', 'CE', 'PAS', 'TI'],
      default: 'CC',
    },
    nombres: {
      type: String,
      required: [true, 'Los nombres son requeridos'],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    apellidos: {
      type: String,
      required: [true, 'Los apellidos son requeridos'],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    fecha_nacimiento: {
      type: Date,
    },

    // --- Contacto ---
    email: {
      type: String,
      required: [true, 'El email es requerido'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Formato de email inválido'],
    },
    telefono: {
      type: String,
      trim: true,
      match: [/^\+?57[0-9]{10}$/, 'Formato de teléfono colombiano inválido'],
    },
    celular: {
      type: String,
      trim: true,
    },

    // --- Rol y permisos (RBAC) ---
    role: {
      type: String,
      enum: ['admin', 'residente', 'propietario', 'portero', 'vigilante'],
      default: 'residente',
    },

    // --- Seguridad: contraseña hasheada ---
    // NUNCA almacenar la contraseña en texto plano
    password_hash: {
      type: String,
      required: [true, 'La contraseña es requerida'],
      minlength: 8,
      select: false, // No se retorna en queries por defecto
    },

    // --- Relaciones ---
    // Conjunto al que pertenece (permite multitenancy futuro)
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
    },
    // Unidades vinculadas al usuario (un propietario puede tener varias)
    unidades: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    }],

    // --- Consentimiento (Ley 1581 de 2012 - Obligatorio) ---
    consent: {
      dado: { type: Boolean, default: false },
      fecha: { type: Date },
      version: { type: String }, // Versión de la política aceptada
      ip: { type: String },      // IP desde donde se aceptó
      canal: { type: String, enum: ['web', 'app', 'presencial'] },
    },

    // --- Estado y auditoría ---
    activo: {
      type: Boolean,
      default: true,
    },
    ultimo_acceso: {
      type: Date,
    },
    // Soft delete: no se borra el registro, solo se marca la fecha
    // Obligatorio para cumplir con retención de datos Ley 1581
    deletedAt: {
      type: Date,
      default: null,
    },

    // Solicitudes ARCO (Acceso, Rectificación, Cancelación, Oposición)
    arco_solicitudes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ArcoRequest',
    }],
  },
  {
    // Mongoose agrega automáticamente createdAt y updatedAt
    timestamps: true,
  }
);

// ==========================================
// ÍNDICES
// ==========================================
// Email único global (login y búsquedas frecuentes)
userSchema.index({ email: 1 }, { unique: true });
// Cédula única por conjunto (un residente puede estar en varios conjuntos en el futuro)
userSchema.index({ cedula: 1, conjunto_id: 1 }, { unique: true, sparse: true });
// Para filtrar usuarios activos/inactivos eficientemente
userSchema.index({ activo: 1, role: 1 });

// ==========================================
// MIDDLEWARE PRE-SAVE: Hashear contraseña
// ==========================================
/**
 * Solo hashea la contraseña si fue modificada.
 * Evita re-hashear en cada actualización del documento.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();

  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password_hash = await bcrypt.hash(this.password_hash, rounds);
  next();
});

// ==========================================
// MÉTODOS DE INSTANCIA
// ==========================================

/**
 * Compara una contraseña en texto plano con el hash almacenado.
 * @param {string} candidatePassword - Contraseña ingresada por el usuario
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

/**
 * Retorna los datos del usuario sin información sensible.
 * Útil para respuestas de la API.
 */
userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.__v;
  return obj;
};

// ==========================================
// QUERY MIDDLEWARE: Excluir soft-deleted
// ==========================================
/**
 * Por defecto, todos los queries excluyen documentos con deletedAt.
 * Para incluirlos, usar: Model.find().setOptions({ includeDeleted: true })
 */
userSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
