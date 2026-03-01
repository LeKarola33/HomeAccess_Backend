/**
 * HomeAccess - Seed de datos iniciales
 * ======================================
 * Crea el conjunto de prueba y el usuario administrador inicial.
 *
 * USO:
 *   node src/seeds/seed.js          → inserta datos si no existen
 *   node src/seeds/seed.js --reset  → elimina TODO y vuelve a insertar
 *
 * IMPORTANTE: Solo usar --reset en desarrollo. En producción correr sin flag.
 *
 * FLUJO DEL SEED:
 *   1. Conectar a MongoDB
 *   2. (Opcional) Limpiar colecciones si se pasa --reset
 *   3. Crear el Conjunto base
 *   4. Crear el usuario Admin vinculado al Conjunto
 *   5. Confirmar y salir
 */

require('dotenv').config();

const mongoose = require('mongoose');
const Conjunto = require('../models/Conjunto.model');
const User = require('../models/User.model');

// ─── Datos del Conjunto de prueba ─────────────────────────────────────────────
// Estos valores se usan como base. En producción cambiar por datos reales.
const SEED_CONJUNTO = {
  nombre: 'Conjunto Residencial Las Palmas',
  nit: '900123456',
  direccion: 'Cra 5 # 10-20, Barrio El Peñón',
  ciudad: 'Cali',
  departamento: 'Valle del Cauca',
  email_admin: 'admin@conjunto.co',
  telefono: '+6023456789',
  total_unidades: 50,
  porterias: ['Principal', 'Parqueadero'],
  plan: 'estandar',
  activo: true,
};

// ─── Datos del Admin inicial ──────────────────────────────────────────────────
// Se leen de variables de entorno (definidas en .env) para no hardcodear
// credenciales en el código fuente.
const SEED_ADMIN = {
  cedula: process.env.ADMIN_CEDULA || '1000000001',
  tipo_documento: 'CC',
  nombres: 'Administrador',
  apellidos: 'Principal',
  email: process.env.ADMIN_EMAIL || 'admin@conjunto.co',
  password_hash: process.env.ADMIN_PASSWORD || 'Admin1234', // pre-save hook lo hashea
  role: 'admin',
  activo: true,
  consent: {
    dado: true,
    fecha: new Date(),
    version: '1.0',
    canal: 'presencial',
    ip: '127.0.0.1',
  },
};

// ─── Función auxiliar: limpiar colecciones ────────────────────────────────────
/**
 * Elimina todos los documentos de las colecciones relevantes.
 * SOLO para uso en desarrollo con --reset.
 */
const clearCollections = async () => {
  console.log('🧹 Limpiando colecciones...');

  // Usar deleteMany directamente sobre la conexión para saltarse
  // el query middleware de soft-delete y borrar absolutamente todo.
  await mongoose.connection.db.collection('conjuntos').deleteMany({});
  await mongoose.connection.db.collection('users').deleteMany({});

  console.log('   ✅ Colecciones vaciadas');
};

// ─── Función principal ────────────────────────────────────────────────────────
const runSeed = async () => {
  const isReset = process.argv.includes('--reset');

  console.log('\n🌱 HomeAccess — Seed inicial');
  console.log(`   Modo: ${isReset ? '⚠️  RESET (borra y recrea)' : 'Incremental (no duplica)'}`);
  console.log(`   BD:   ${process.env.MONGODB_URI?.split('@')[1] || 'local'}\n`); // oculta credenciales en el log

  // 1. Conectar a la base de datos
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB');

  // 2. Reset opcional
  if (isReset) {
    await clearCollections();
  }

  // ─── 3. Crear Conjunto ─────────────────────────────────────────────────────
  let conjunto;

  // Buscar incluyendo soft-deleted para evitar duplicados silenciosos
  const existingConjunto = await Conjunto.findOne({ nit: SEED_CONJUNTO.nit })
    .setOptions({ includeDeleted: true });

  if (existingConjunto) {
    console.log(`ℹ️  Conjunto ya existe: "${existingConjunto.nombre}" (NIT: ${existingConjunto.nit})`);
    conjunto = existingConjunto;
  } else {
    conjunto = await Conjunto.create(SEED_CONJUNTO);
    console.log(`✅ Conjunto creado: "${conjunto.nombre}" → ID: ${conjunto._id}`);
  }

  // ─── 4. Crear usuario Admin ────────────────────────────────────────────────
  const existingAdmin = await User.findOne({ email: SEED_ADMIN.email })
    .setOptions({ includeDeleted: true });

  if (existingAdmin) {
    console.log(`ℹ️  Admin ya existe: ${existingAdmin.email}`);
  } else {
    // conjunto_id se asigna aquí: el admin queda vinculado al conjunto creado
    await User.create({
      ...SEED_ADMIN,
      conjunto_id: conjunto._id,
    });
    console.log(`✅ Admin creado: ${SEED_ADMIN.email}`);
    console.log(`   Contraseña inicial: ${process.env.ADMIN_PASSWORD || 'Admin1234'}`);
    console.log('   ⚠️  Cambia la contraseña en el primer login');
  }

  // ─── 5. Resumen ────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('📋 Credenciales para Postman / API tests:');
  console.log(`   Email:    ${SEED_ADMIN.email}`);
  console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'Admin1234'}`);
  console.log(`   Endpoint: POST /api/v1/auth/login`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('👋 Seed completado. Conexión cerrada.\n');
};

// ─── Ejecutar y manejar errores ───────────────────────────────────────────────
runSeed().catch((err) => {
  console.error('\n❌ Error durante el seed:', err.message);
  console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});
