/**
 * HomeAccess - Rutas de Paquetes y Correspondencia
 * ==================================================
 */

const express = require('express');
const Package = require('../models/Package.model');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// Listar paquetes (admin/portero ven todos; residente solo los suyos)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id };

    // Los residentes solo ven sus propios paquetes
    if (!['admin', 'portero', 'vigilante'].includes(req.user.role)) {
      filter.destinatario_id = req.user._id;
    }

    if (req.query.estado) filter.estado = req.query.estado;

    const [packages, total] = await Promise.all([
      Package.find(filter)
        .populate('destinatario_id', 'nombres apellidos')
        .populate('unit_destino', 'numero torre')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Package.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: packages,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// Registrar llegada de paquete (portero/admin)
router.post('/', authorize('admin', 'portero', 'vigilante'), async (req, res, next) => {
  try {
    const pkg = await Package.create({
      ...req.body,
      conjunto_id: req.user.conjunto_id,
      recibido_por: req.user._id,
      fecha_recepcion: new Date(),
    });
    res.status(201).json({ success: true, data: pkg, message: 'Paquete registrado' });
  } catch (error) {
    next(error);
  }
});

// Marcar paquete como entregado
router.patch('/:id/entregar', authorize('admin', 'portero', 'vigilante'), async (req, res, next) => {
  try {
    const pkg = await Package.findByIdAndUpdate(
      req.params.id,
      {
        estado: 'entregado',
        entregado_a: req.body.entregado_a,
        fecha_entrega: new Date(),
      },
      { new: true }
    );

    if (!pkg) return res.status(404).json({ success: false, message: 'Paquete no encontrado' });

    res.status(200).json({ success: true, data: pkg, message: 'Paquete entregado exitosamente' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
