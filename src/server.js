/**
 * HomeAccess - Punto de entrada del servidor
 * ==========================================
 * Inicializa Express, conecta a MongoDB y arranca el servidor HTTP.
 */

// Carga las variables de entorno lo primero de todo
require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/database');

const PORT = process.env.PORT || 5000;

/**
 * Función principal de inicio del servidor.
 * Se usa async para esperar la conexión a la BD antes de escuchar.
 */
const startServer = async () => {
  try {
    // Conectar a MongoDB antes de aceptar peticiones
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n🏢 HomeAccess API corriendo en modo ${process.env.NODE_ENV}`);
      console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
      console.log(`📚 Documentación API: http://localhost:${PORT}/api-docs\n`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error.message);
    process.exit(1);
  }
};

// Manejo de excepciones no capturadas para evitar crash silencioso
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  process.exit(1);
});

startServer();
