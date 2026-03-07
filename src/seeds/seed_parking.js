/**
 * seed_parking.js
 * ================
 * Script para crear los 50 puestos de parqueadero en la BD.
 * 
 * Uso:
 *   node seed_parking.js
 *
 * Variables de entorno requeridas:
 *   MONGODB_URI   — URI de conexión a MongoDB
 *   CONJUNTO_ID   — ObjectId del conjunto residencial
 *
 * Los puestos se crean como Units con tipo='parqueadero', estado='desocupado'.
 * Numeración: P-01 … P-50
 * Se omiten puestos que ya existen (idempotente).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/homeaccess';
const CONJUNTO_ID = process.env.CONJUNTO_ID;

if (!CONJUNTO_ID) {
  console.error('❌  Falta la variable CONJUNTO_ID en .env');
  process.exit(1);
}

// ─── Inline schema (evita importar el modelo completo) ────────────────────────
const unitSchema = new mongoose.Schema({
  conjunto_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Complex', required: true },
  numero:              { type: String, required: true },
  tipo:                { type: String, enum: ['apartamento','casa','local','bodega','parqueadero'], required: true },
  estado:              { type: String, enum: ['desocupado','ocupado','en_mantenimiento','en_venta'], default: 'desocupado' },
  torre:               String,
  piso:                Number,
  propietario_actual:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  historial_propietarios: [{ user_id: mongoose.Schema.Types.ObjectId, fecha_inicio: Date, fecha_fin: Date }],
  residentes:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  vehiculos:           [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' }],
  mascotas:            [{ nombre: String, especie: String, raza: String }],
  activo:              { type: Boolean, default: true },
}, { timestamps: true });

const Unit = mongoose.models.Unit || mongoose.model('Unit', unitSchema);

const TOTAL_SPOTS = 50;

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅  Conectado a MongoDB');

  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= TOTAL_SPOTS; i++) {
    const numero = `P-${String(i).padStart(2, '0')}`;

    const existing = await Unit.findOne({
      conjunto_id: CONJUNTO_ID,
      tipo:        'parqueadero',
      numero,
    });

    if (existing) { skipped++; continue; }

    await Unit.create({
      conjunto_id: CONJUNTO_ID,
      numero,
      tipo:   'parqueadero',
      estado: 'desocupado',
    });
    created++;
    process.stdout.write(`\r  Creando puestos... ${i}/${TOTAL_SPOTS}`);
  }

  console.log(`\n\n✅  Listo`);
  console.log(`   Creados:  ${created}`);
  console.log(`   Omitidos: ${skipped} (ya existían)`);
  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
