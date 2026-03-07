/**
 * HomeAccess - Package Controller
 * =================================
 * Gestión de paquetes y correspondencia recibida en portería.
 *
 * ESTADOS: en_porteria → entregado | devuelto | perdido
 *
 * CAMPOS REQUERIDOS al crear:
 *   - unit_destino    (ObjectId de la unidad destinataria)
 *   - destinatario_id (ObjectId del residente/propietario)
 *   - tipo            (paquete|sobre|documento|perecedero|otro)
 *
 * CAMPOS OPCIONALES:
 *   - remitente, transportadora, guia, descripcion
 */

const Package = require('../models/Package.model');
const Unit    = require('../models/Unit.model');

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/packages
 * Admin/portero/vigilante: todos los paquetes del conjunto
 * Residente: solo los suyos
 * Filtros: ?estado= ?unit_destino= ?page= ?limit=
 */
const getPackages = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id };

    if (!['admin', 'portero', 'vigilante'].includes(req.user.role)) {
      filter.destinatario_id = req.user._id;
    }

    if (req.query.estado)       filter.estado       = req.query.estado;
    if (req.query.unit_destino) filter.unit_destino = req.query.unit_destino;

    const [packages, total] = await Promise.all([
      Package.find(filter)
        .populate('unit_destino',    'numero torre')
        .populate('destinatario_id', 'nombres apellidos celular')
        .populate('recibido_por',    'nombres apellidos')
        .populate('entregado_a',     'nombres apellidos')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Package.countDocuments(filter),
    ]);

    // Resumen por estado
    const resumen = await Package.aggregate([
      { $match: { conjunto_id: req.user.conjunto_id } },
      { $group: { _id: '$estado', total: { $sum: 1 } } },
    ]);
    const porEstado = resumen.reduce((acc, r) => { acc[r._id] = r.total; return acc; }, {});

    res.status(200).json({
      success: true,
      data: packages,
      resumen: porEstado,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE
// ─────────────────────────────────────────────────────────────────────────────

const getPackageById = async (req, res, next) => {
  try {
    const pkg = await Package.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    })
      .populate('unit_destino',    'numero torre')
      .populate('destinatario_id', 'nombres apellidos celular')
      .populate('recibido_por',    'nombres apellidos')
      .populate('entregado_a',     'nombres apellidos')
      .lean();

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    }

    res.status(200).json({ success: true, data: pkg });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/packages
 * Registra la llegada de un paquete en portería.
 * Roles: admin, portero, vigilante
 *
 * Body requerido: unit_destino, destinatario_id, tipo
 * Body opcional:  remitente, transportadora, guia, descripcion
 */
const createPackage = async (req, res, next) => {
  try {
    const {
      unit_destino, destinatario_id, tipo,
      remitente, transportadora, guia, descripcion,
    } = req.body;

    // Verificar que la unidad existe y pertenece al conjunto
    const unit = await Unit.findOne({
      _id:         unit_destino,
      conjunto_id: req.user.conjunto_id,
    });
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unidad de destino no encontrada en este conjunto',
      });
    }

    const pkg = await Package.create({
      conjunto_id:     req.user.conjunto_id,
      unit_destino,
      destinatario_id,
      tipo:            tipo || 'paquete',
      remitente:       remitente    || null,
      transportadora:  transportadora || null,
      guia:            guia         || null,
      descripcion:     descripcion  || null,
      recibido_por:    req.user._id,
      fecha_recepcion: new Date(),
      estado:          'en_porteria',
    });

    const populated = await pkg.populate([
      { path: 'unit_destino',    select: 'numero torre' },
      { path: 'destinatario_id', select: 'nombres apellidos' },
      { path: 'recibido_por',    select: 'nombres apellidos' },
    ]);

    res.status(201).json({
      success: true,
      data:    populated,
      message: `Paquete registrado para ${unit.numero}`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ENTREGAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/packages/:id/entregar
 * Marca el paquete como entregado al residente.
 * Body: entregado_a (ObjectId del usuario que recibe)
 */
const entregarPackage = async (req, res, next) => {
  try {
    const pkg = await Package.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    }

    if (pkg.estado !== 'en_porteria') {
      return res.status(409).json({
        success: false,
        message: `El paquete ya fue ${pkg.estado}. Solo se pueden entregar paquetes en portería.`,
      });
    }

    pkg.estado        = 'entregado';
    pkg.entregado_a   = req.body.entregado_a || pkg.destinatario_id;
    pkg.fecha_entrega = new Date();
    await pkg.save();

    const populated = await Package.findById(pkg._id)
      .populate('unit_destino',    'numero torre')
      .populate('destinatario_id', 'nombres apellidos')
      .populate('entregado_a',     'nombres apellidos')
      .lean();

    res.status(200).json({
      success: true,
      data:    populated,
      message: 'Paquete entregado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CAMBIAR ESTADO (devuelto / perdido)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/packages/:id/estado
 * Cambia estado a: devuelto | perdido
 * Solo admin.
 */
const cambiarEstado = async (req, res, next) => {
  try {
    const { estado, descripcion } = req.body;

    const permitidos = ['devuelto', 'perdido'];
    if (!permitidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        message: `Estado inválido. Use: ${permitidos.join(', ')}`,
      });
    }

    const pkg = await Package.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    }

    if (pkg.estado === 'entregado') {
      return res.status(409).json({
        success: false,
        message: 'No se puede cambiar el estado de un paquete ya entregado',
      });
    }

    pkg.estado      = estado;
    if (descripcion) pkg.descripcion = descripcion;
    await pkg.save();

    res.status(200).json({
      success: true,
      data:    pkg,
      message: `Paquete marcado como ${estado}`,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/v1/packages/:id
 * Soft delete. Solo admin.
 */
const deletePackage = async (req, res, next) => {
  try {
    const pkg = await Package.findOne({
      _id:         req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
    }

    await Package.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });

    res.status(200).json({ success: true, message: 'Paquete eliminado del registro' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPackages,
  getPackageById,
  createPackage,
  entregarPackage,
  cambiarEstado,
  deletePackage,
};
