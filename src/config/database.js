/**
 * HomeAccess - Configuración de conexión a MongoDB
 * =================================================
 * Gestiona la conexión mediante Mongoose con manejo de eventos
 * para detectar desconexiones y errores en tiempo real.
 */

const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI no está definida en las variables de entorno');
  }

  try {
    const conn = await mongoose.connect(uri, {
      // Opciones recomendadas para producción con Mongoose 8+
      serverSelectionTimeoutMS: 5000, // Tiempo máximo de espera para seleccionar servidor
      socketTimeoutMS: 45000,         // Tiempo máximo de inactividad del socket
    });

    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);

    // Eventos de ciclo de vida de la conexión
    mongoose.connection.on('error', (err) => {
      console.error('❌ Error de MongoDB:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB desconectado');
    });

  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error.message);
    throw error; // Re-lanzar para que server.js maneje el process.exit
  }
};

module.exports = connectDB;
