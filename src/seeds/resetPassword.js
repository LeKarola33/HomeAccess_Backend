// homeaccess-backend/src/seeds/resetPassword.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const db = mongoose.connection.db;
  const newHash = await bcrypt.hash('Admin1234', 12);
  
  await db.collection('usuarios').updateOne(
    { email: 'admin@conjunto.co' },
    { $set: { password_hash: newHash } }
  );
  
  console.log('✅ Contraseña actualizada correctamente');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });