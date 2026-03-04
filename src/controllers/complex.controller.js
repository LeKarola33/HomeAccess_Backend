/**
 * HomeAccess - Controlador de Conjuntos Residenciales
 * ====================================================
 * Operaciones de lectura y actualización del conjunto.
 * No expone creación ni eliminación (ver comentario en routes).
 *
 * Patrón de respuesta estándar (igual que todos los controllers):
 *   { success: boolean, data: any, message?: string }
 */

const Complex = require('../models/Complex.model');

/**
 * GET /api/v1/complexes/me
 * ─────────────────────────
 * Retorna el conjunto del admin autenticado.
 * Útil para que el frontend cargue la configuración sin conocer el ID.
 *
 * Requiere: rol admin
 */
const getMyComplex = async (req, res, next) => {
  try {
    // req.user.conjunto_id viene del middleware protect (cargado desde la BD)
    const complex = await Complex.findById(req.user.conjunto_id);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: 'Complex not found. Contact support.',
      });
    }

    res.status(200).json({ success: true, data: complex });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/complexes/:id
 * ─────────────────────────
 * Retorna un conjunto por ID.
 * Valida que el admin solo consulte su propio conjunto (seguridad multitenant).
 *
 * Requiere: rol admin
 */
const getComplexById = async (req, res, next) => {
  try {
    // Guard multitenant: un admin no puede ver datos de otro conjunto
    // Se compara como string porque _id es ObjectId y params.id es string
    if (req.user.conjunto_id?.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own complex.',
      });
    }

    const complex = await Complex.findById(req.params.id);

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: 'Complex not found',
      });
    }

    res.status(200).json({ success: true, data: complex });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/complexes/:id
 * ─────────────────────────
 * Actualiza los datos configurables del conjunto.
 * Ignora campos de identidad: nit, email_admin, deletedAt, activo.
 *
 * Requiere: rol admin + ser admin del conjunto que se actualiza
 */
const updateComplex = async (req, res, next) => {
  try {
    // Guard multitenant: el admin solo puede editar su propio conjunto
    if (req.user.conjunto_id?.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only modify your own complex.',
      });
    }

    // Campos que NO se pueden modificar por API (identidad y seguridad)
    const restricted = ['nit', 'email_admin', 'activo', 'deletedAt', '_id'];
    restricted.forEach((field) => delete req.body[field]);

    const complex = await Complex.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,           // retorna el documento ya actualizado
        runValidators: true, // ejecuta las validaciones del schema en el update
      }
    );

    if (!complex) {
      return res.status(404).json({
        success: false,
        message: 'Complex not found',
      });
    }

    res.status(200).json({
      success: true,
      data: complex,
      message: 'Complex updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMyComplex, getComplexById, updateComplex };
