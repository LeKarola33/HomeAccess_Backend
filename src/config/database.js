/**
 * HomeAccess - Configuración de conexión a MongoDB
 * =================================================
 * Con caché para entornos serverless (Vercel)
 */

const mongoose = require('mongoose');

// Caché global para reutilizar conexión entre invocaciones serverless
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI no está definida en las variables de entorno');
  }

  // ✅ Si ya hay conexión activa, reutilizarla
  if (cached.conn) {
    return cached.conn;
  }

  // ✅ Si hay una promesa en curso, esperarla (evita conexiones paralelas)
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,          // Falla inmediato si no hay conexión
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    cached.promise
      .then((conn) => {
        console.log(`✅ MongoDB conectado: ${conn.connection.host}`);

        mongoose.connection.on('error', (err) => {
          console.error('❌ Error de MongoDB:', err.message);
          cached.conn = null;     // 👈 Resetea caché para reconectar
          cached.promise = null;
        });

        mongoose.connection.on('disconnected', () => {
          console.warn('⚠️  MongoDB desconectado');
          cached.conn = null;     // 👈 Resetea caché para reconectar
          cached.promise = null;
        });
      })
      .catch((error) => {
        console.error('❌ Error al conectar a MongoDB:', error.message);
        cached.promise = null;    // 👈 Limpia para permitir reintento
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;
