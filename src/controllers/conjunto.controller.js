/**
 * HomeAccess - Controlador de Conjuntos Residenciales
 * ====================================================
 * Operaciones de lectura y actualización del conjunto.
 * No expone creación ni eliminación (ver comentario en routes).
 *
 * Patrón de respuesta estándar (igual que todos los controllers):
 *   { success: boolean, data: any, message?: string }
 */

const Conjunto = require('../models/Conjunto.model');

/**
 * GET /api/v1/conjuntos/me
 * ─────────────────────────
 * Retorna el conjunto del admin autenticado.
 * Útil para que el frontend cargue la configuración sin conocer el ID.
 *
 * Requiere: rol admin
 */
const getMyConjunto = async (req, res, next) => {
  try {
    // req.user.conjunto_id viene del middleware protect (cargado desde la BD)
    const conjunto = await Conjunto.findById(req.user.conjunto_id);

    if (!conjunto) {
      return res.status(404).json({
        success: false,
        message: 'Conjunto no encontrado. Contacte al soporte.',
      });
    }

    res.status(200).json({ success: true, data: conjunto });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/conjuntos/:id
 * ─────────────────────────
 * Retorna un conjunto por ID.
 * Valida que el admin solo consulte su propio conjunto (seguridad multitenant).
 *
 * Requiere: rol admin
 */
const getConjuntoById = async (req, res, next) => {
  try {
    // Guard multitenant: un admin no puede ver datos de otro conjunto
    // Se compara como string porque _id es ObjectId y params.id es string
    if (req.user.conjunto_id?.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo puede consultar su propio conjunto.',
      });
    }

    const conjunto = await Conjunto.findById(req.params.id);

    if (!conjunto) {
      return res.status(404).json({
        success: false,
        message: 'Conjunto no encontrado',
      });
    }

    res.status(200).json({ success: true, data: conjunto });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/conjuntos/:id
 * ─────────────────────────
 * Actualiza los datos configurables del conjunto.
 * Ignora campos de identidad: nit, email_admin, deletedAt, activo.
 *
 * Requiere: rol admin + ser admin del conjunto que se actualiza
 */
const updateConjunto = async (req, res, next) => {
  try {
    // Guard multitenant: el admin solo puede editar su propio conjunto
    if (req.user.conjunto_id?.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo puede modificar su propio conjunto.',
      });
    }

    // Campos que NO se pueden modificar por API (identidad y seguridad)
    const restricted = ['nit', 'email_admin', 'activo', 'deletedAt', '_id'];
    restricted.forEach((field) => delete req.body[field]);

    const conjunto = await Conjunto.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,           // retorna el documento ya actualizado
        runValidators: true, // ejecuta las validaciones del schema en el update
      }
    );

    if (!conjunto) {
      return res.status(404).json({
        success: false,
        message: 'Conjunto no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      data: conjunto,
      message: 'Conjunto actualizado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMyConjunto, getConjuntoById, updateConjunto };
