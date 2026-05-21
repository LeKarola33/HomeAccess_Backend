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
      enum: ['CC', 'CE', 'PAS', 'TI', 'RC'],
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
    password_hash: {
      type: String,
      required: [true, 'La contraseña es requerida'],
      minlength: 8,
      select: false,
    },

    // --- Relaciones ---
    conjunto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conjunto',
    },
    unidades: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    }],

    // ── Niños del residente (Ley 1581 — menores de edad) ──────────
    ninos: [
      {
        nombres:          { type: String, trim: true },
        fecha_nacimiento: { type: Date },
        tipo_documento:   { type: String, enum: ['CC', 'CE', 'PAS', 'TI', 'RC'], default: 'TI' },
        documento:        { type: String, trim: true },
      },
    ],

    // ── Mascotas del residente ────────────────────────────────────
    mascotas: [
      {
        nombre:  { type: String, trim: true },
        especie: {
          type: String,
          enum: ['perro', 'gato', 'ave', 'pez', 'conejo', 'reptil', 'otro'],
          default: 'perro',
        },
        raza:   { type: String, trim: true },
        color:  { type: String, trim: true },
      },
    ],

    // --- Consentimiento (Ley 1581 de 2012 - Obligatorio) ---
    consent: {
      dado:    { type: Boolean, default: false },
      fecha:   { type: Date },
      version: { type: String },
      ip:      { type: String },
      canal:   { type: String, enum: ['web', 'app', 'presencial'] },
    },

    // --- Estado y auditoría ---
    activo: {
      type: Boolean,
      default: true,
    },
    ultimo_acceso: {
      type: Date,
    },
    deletedAt: {
      type: Date,
      default: null,
    },

    arco_solicitudes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ArcoRequest',
    }],
  },
  {
    timestamps: true,
  }
);

// ==========================================
// ÍNDICES
// ==========================================
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ cedula: 1, conjunto_id: 1 }, { unique: true, sparse: true });
userSchema.index({ activo: 1, role: 1 });

// ==========================================
// MIDDLEWARE PRE-SAVE: Hashear contraseña
// ==========================================
userSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password_hash = await bcrypt.hash(this.password_hash, rounds);
  next();
});

// ==========================================
// MÉTODOS DE INSTANCIA
// ==========================================
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password_hash;
  delete obj.__v;
  return obj;
};

// ==========================================
// QUERY MIDDLEWARE: Excluir soft-deleted
// ==========================================
userSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
