/**
 * HomeAccess - Rutas de Unidades Residenciales
 * ==============================================
 * GET    /api/v1/units       -> listar unidades
 * POST   /api/v1/units       -> crear unidad (admin)
 * GET    /api/v1/units/:id   -> detalle de unidad
 * PUT    /api/v1/units/:id   -> actualizar unidad (admin)
 */

const express = require('express');
const Unit = require('../models/Unit.model');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// Listar unidades del conjunto con paginación
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id };
    if (req.query.estado) filter.estado = req.query.estado;
    if (req.query.tipo) filter.tipo = req.query.tipo;

    const [units, total] = await Promise.all([
      Unit.find(filter)
        .populate('propietario_actual', 'nombres apellidos')
        .sort({ numero: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Unit.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: units,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// Crear unidad (solo admin)
router.post('/', authorize('admin'), async (req, res, next) => {
  try {
    const unit = await Unit.create({
      ...req.body,
      conjunto_id: req.user.conjunto_id,
    });
    res.status(201).json({ success: true, data: unit, message: 'Unidad creada exitosamente' });
  } catch (error) {
    next(error);
  }
});

// Detalle de unidad
router.get('/:id', async (req, res, next) => {
  try {
    const unit = await Unit.findById(req.params.id)
      .populate('propietario_actual', 'nombres apellidos email celular')
      .populate('residentes', 'nombres apellidos')
      .lean();

    if (!unit) return res.status(404).json({ success: false, message: 'Unidad no encontrada' });

    res.status(200).json({ success: true, data: unit });
  } catch (error) {
    next(error);
  }
});

// Actualizar unidad (solo admin)
router.put('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!unit) return res.status(404).json({ success: false, message: 'Unidad no encontrada' });

    res.status(200).json({ success: true, data: unit, message: 'Unidad actualizada' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
