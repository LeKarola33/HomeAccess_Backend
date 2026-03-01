// homeaccess-backend/src/seeds/debug.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const db = mongoose.connection.db;
  
  // Buscar el usuario directamente sin Mongoose (sin query middleware)
  const user = await db.collection('usuarios').findOne({ email: 'admin@conjunto.co' });
  
  console.log('Usuario encontrado:', user ? 'SÍ' : 'NO');
  
  if (user) {
    console.log('email:', user.email);
    console.log('activo:', user.activo);
    console.log('deletedAt:', user.deletedAt);
    console.log('password_hash existe:', !!user.password_hash);
    console.log('password_hash valor:', user.password_hash);
    
    // Probar comparación directa
    const match = await bcrypt.compare('Admin1234', user.password_hash);
    console.log('¿Contraseña coincide?:', match);
  }
  
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });