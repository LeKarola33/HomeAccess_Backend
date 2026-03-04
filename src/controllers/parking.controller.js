/**
 * HomeAccess - Controlador de Parqueadero
 * =========================================
 * Gestiona vehículos registrados y asignación de puestos de parqueadero.
 *
 * LÓGICA DE NEGOCIO CLAVE:
 *   - Un "parqueadero" en este sistema es una Unit con tipo='parqueadero'.
 *     Esto aprovecha el modelo existente y reutiliza la paginación/filtros.
 *   - Al registrar un vehículo, se agrega su _id al array Unit.vehiculos[].
 *   - Al asignar parqueadero: el puesto (Unit tipo=parqueadero) cambia su
 *     estado a 'ocupado' y se guarda en Vehicle.parqueadero_id.
 *   - Al desasignar: el puesto vuelve a 'desocupado' y parqueadero_id=null.
 *   - Un puesto solo puede tener UN vehículo a la vez.
 */

const Vehicle = require('../models/Vehicle.model');
const Unit = require('../models/Unit.model');

// ─────────────────────────────────────────────────────────────────────────────
// VEHÍCULOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/parqueadero/vehiculos
 * Lista todos los vehículos del conjunto con paginación.
 * Admin/portero: todos | Residente: solo los de su unidad.
 * Filtros opcionales: ?unit_id=...  ?tipo=carro  ?placa=ABC
 */
const getVehiculos = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { conjunto_id: req.user.conjunto_id, activo: true };

    // Residentes y propietarios solo ven los vehículos de su propia unidad
    if (!['admin', 'portero', 'vigilante'].includes(req.user.role)) {
      // req.user.unidades[] viene del modelo User (array de unit_ids)
      filter.unit_id = { $in: req.user.unidades };
    }

    // Filtros opcionales desde query params
    if (req.query.unit_id)    filter.unit_id = req.query.unit_id;
    if (req.query.tipo)       filter.tipo    = req.query.tipo;
    if (req.query.placa)      filter.placa   = new RegExp(req.query.placa.toUpperCase(), 'i');

    const [vehiculos, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('unit_id',         'numero torre piso')
        .populate('propietario_id',  'nombres apellidos celular')
        .populate('parqueadero_id',  'numero estado')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Vehicle.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: vehiculos,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/parqueadero/vehiculos/:id
 * Detalle de un vehículo específico.
 */
const getVehiculoById = async (req, res, next) => {
  try {
    const vehiculo = await Vehicle.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    })
      .populate('unit_id',        'numero torre piso')
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'numero estado')
      .lean();

    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    res.status(200).json({ success: true, data: vehiculo });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/parqueadero/vehiculos
 * Registra un nuevo vehículo y lo vincula a su unidad.
 * También actualiza Unit.vehiculos[] para mantener la referencia bidireccional.
 */
const registrarVehiculo = async (req, res, next) => {
  try {
    const { unit_id, propietario_id, placa, tipo, marca, modelo, color, anio } = req.body;

    // Verificar que la unidad existe y pertenece al conjunto
    const unit = await Unit.findOne({
      _id: unit_id,
      conjunto_id: req.user.conjunto_id,
    });
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    // Crear el vehículo (la placa se uppercase en el modelo via 'uppercase: true')
    const vehiculo = await Vehicle.create({
      conjunto_id: req.user.conjunto_id,
      unit_id,
      propietario_id,
      placa,
      tipo,
      marca,
      modelo,
      color,
      anio,
    });

    // Mantener bidireccionalidad: agregar _id del vehículo al array de la unidad
    await Unit.findByIdAndUpdate(unit_id, {
      $addToSet: { vehiculos: vehiculo._id }, // $addToSet evita duplicados
    });

    const populated = await vehiculo.populate([
      { path: 'unit_id',        select: 'numero torre' },
      { path: 'propietario_id', select: 'nombres apellidos' },
    ]);

    res.status(201).json({
      success: true,
      data: populated,
      message: `Vehículo ${vehiculo.placa} registrado exitosamente`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/parqueadero/vehiculos/:id
 * Actualiza datos del vehículo. No se puede cambiar la placa ni el conjunto.
 */
const actualizarVehiculo = async (req, res, next) => {
  try {
    // Placa y conjunto son inmutables después de crear
    const restricted = ['placa', 'conjunto_id', 'parqueadero_id', 'deletedAt'];
    restricted.forEach((f) => delete req.body[f]);

    const vehiculo = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, conjunto_id: req.user.conjunto_id },
      req.body,
      { new: true, runValidators: true }
    )
      .populate('unit_id',        'numero torre')
      .populate('parqueadero_id', 'numero');

    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    res.status(200).json({ success: true, data: vehiculo, message: 'Vehículo actualizado' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/parqueadero/vehiculos/:id
 * Soft delete del vehículo.
 * Si tenía parqueadero asignado, libera el puesto automáticamente.
 * También remueve el _id del array Unit.vehiculos[].
 */
const eliminarVehiculo = async (req, res, next) => {
  try {
    const vehiculo = await Vehicle.findOne({
      _id: req.params.id,
      conjunto_id: req.user.conjunto_id,
    });

    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    // Si tenía parqueadero, liberar el puesto antes de eliminar
    if (vehiculo.parqueadero_id) {
      await Unit.findByIdAndUpdate(vehiculo.parqueadero_id, {
        estado: 'desocupado',
      });
    }

    // Soft delete del vehículo
    await Vehicle.findByIdAndUpdate(req.params.id, {
      activo: false,
      deletedAt: new Date(),
      parqueadero_id: null,
    });

    // Remover del array vehiculos[] de la unidad
    await Unit.findByIdAndUpdate(vehiculo.unit_id, {
      $pull: { vehiculos: vehiculo._id },
    });

    res.status(200).json({ success: true, message: 'Vehículo eliminado del registro' });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUESTOS DE PARQUEADERO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/parqueadero/puestos
 * Lista todos los puestos de parqueadero del conjunto (Unit tipo='parqueadero').
 * Incluye el vehículo asignado si el puesto está ocupado.
 * Filtros: ?estado=desocupado | ?estado=ocupado
 */
const getPuestos = async (req, res, next) => {
  try {
    const filter = {
      conjunto_id: req.user.conjunto_id,
      tipo: 'parqueadero',
    };

    if (req.query.estado) filter.estado = req.query.estado;

    const puestos = await Unit.find(filter)
      .populate('propietario_actual', 'nombres apellidos')
      .sort({ numero: 1 })
      .lean();

    // Para cada puesto ocupado, adjuntar el vehículo asignado
    const puestosConVehiculo = await Promise.all(
      puestos.map(async (puesto) => {
        if (puesto.estado === 'ocupado') {
          const vehiculo = await Vehicle.findOne({
            parqueadero_id: puesto._id,
            activo: true,
          })
            .populate('unit_id',        'numero torre')
            .populate('propietario_id', 'nombres apellidos')
            .lean();
          return { ...puesto, vehiculo_asignado: vehiculo };
        }
        return { ...puesto, vehiculo_asignado: null };
      })
    );

    const resumen = {
      total:      puestos.length,
      ocupados:   puestos.filter((p) => p.estado === 'ocupado').length,
      libres:     puestos.filter((p) => p.estado === 'desocupado').length,
      mantenimiento: puestos.filter((p) => p.estado === 'en_mantenimiento').length,
    };

    res.status(200).json({
      success: true,
      resumen,
      data: puestosConVehiculo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/parqueadero/puestos/:puestoId
 * Detalle de un puesto específico con el vehículo asignado.
 */
const getPuestoById = async (req, res, next) => {
  try {
    const puesto = await Unit.findOne({
      _id: req.params.puestoId,
      conjunto_id: req.user.conjunto_id,
      tipo: 'parqueadero',
    })
      .populate('propietario_actual', 'nombres apellidos')
      .lean();

    if (!puesto) {
      return res.status(404).json({ success: false, message: 'Puesto de parqueadero no encontrado' });
    }

    // Adjuntar vehículo asignado (si existe)
    const vehiculo = await Vehicle.findOne({
      parqueadero_id: puesto._id,
      activo: true,
    })
      .populate('unit_id',        'numero torre')
      .populate('propietario_id', 'nombres apellidos celular')
      .lean();

    res.status(200).json({
      success: true,
      data: { ...puesto, vehiculo_asignado: vehiculo || null },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/parqueadero/vehiculos/:vehiculoId/asignar
 * Asigna un puesto de parqueadero a un vehículo.
 *
 * Validaciones:
 *   1. El vehículo existe y pertenece al conjunto
 *   2. El puesto existe, es tipo='parqueadero' y está desocupado
 *   3. El vehículo no tiene ya otro puesto asignado
 */
const asignarParqueadero = async (req, res, next) => {
  try {
    const { parqueadero_id } = req.body;

    // ── Buscar vehículo ───────────────────────────────────────────────────────
    const vehiculo = await Vehicle.findOne({
      _id: req.params.vehiculoId,
      conjunto_id: req.user.conjunto_id,
      activo: true,
    });

    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    // ── Validación: el vehículo ya tiene parqueadero ──────────────────────────
    if (vehiculo.parqueadero_id) {
      return res.status(409).json({
        success: false,
        message: 'Este vehículo ya tiene un parqueadero asignado. Desasígnalo primero.',
      });
    }

    // ── Buscar y validar el puesto ────────────────────────────────────────────
    const puesto = await Unit.findOne({
      _id: parqueadero_id,
      conjunto_id: req.user.conjunto_id,
      tipo: 'parqueadero',
    });

    if (!puesto) {
      return res.status(404).json({ success: false, message: 'Puesto de parqueadero no encontrado' });
    }

    if (puesto.estado !== 'desocupado') {
      return res.status(409).json({
        success: false,
        message: `El puesto ${puesto.numero} no está disponible (estado: ${puesto.estado})`,
      });
    }

    // ── Asignar: actualizar vehículo + cambiar estado del puesto ─────────────
    const [vehiculoActualizado] = await Promise.all([
      Vehicle.findByIdAndUpdate(
        vehiculo._id,
        { parqueadero_id },
        { new: true }
      )
        .populate('unit_id',        'numero torre')
        .populate('propietario_id', 'nombres apellidos')
        .populate('parqueadero_id', 'numero'),

      Unit.findByIdAndUpdate(parqueadero_id, { estado: 'ocupado' }),
    ]);

    res.status(200).json({
      success: true,
      data: vehiculoActualizado,
      message: `Vehículo ${vehiculo.placa} asignado al puesto ${puesto.numero}`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/parqueadero/vehiculos/:vehiculoId/desasignar
 * Libera el puesto de parqueadero de un vehículo.
 */
const desasignarParqueadero = async (req, res, next) => {
  try {
    const vehiculo = await Vehicle.findOne({
      _id: req.params.vehiculoId,
      conjunto_id: req.user.conjunto_id,
      activo: true,
    });

    if (!vehiculo) {
      return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
    }

    if (!vehiculo.parqueadero_id) {
      return res.status(409).json({
        success: false,
        message: 'Este vehículo no tiene parqueadero asignado',
      });
    }

    const puestoId = vehiculo.parqueadero_id;

    // Liberar puesto y limpiar referencia en el vehículo
    const [vehiculoActualizado] = await Promise.all([
      Vehicle.findByIdAndUpdate(
        vehiculo._id,
        { parqueadero_id: null },
        { new: true }
      ).populate('unit_id', 'numero torre'),

      Unit.findByIdAndUpdate(puestoId, { estado: 'desocupado' }),
    ]);

    res.status(200).json({
      success: true,
      data: vehiculoActualizado,
      message: `Vehículo ${vehiculo.placa} desasignado. Puesto liberado.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/parqueadero/unidad/:unitId
 * Lista todos los vehículos Y puestos asignados de una unidad específica.
 * Vista útil en la ficha del apartamento.
 */
const getParqueaderoByUnidad = async (req, res, next) => {
  try {
    // Guard multitenant
    const unit = await Unit.findOne({
      _id: req.params.unitId,
      conjunto_id: req.user.conjunto_id,
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unidad no encontrada' });
    }

    const vehiculos = await Vehicle.find({
      unit_id: req.params.unitId,
      activo: true,
    })
      .populate('propietario_id', 'nombres apellidos celular')
      .populate('parqueadero_id', 'numero estado')
      .lean();

    res.status(200).json({
      success: true,
      unidad: { numero: unit.numero, torre: unit.torre },
      total_vehiculos: vehiculos.length,
      data: vehiculos,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Vehículos
  getVehiculos,
  getVehiculoById,
  registrarVehiculo,
  actualizarVehiculo,
  eliminarVehiculo,
  // Puestos
  getPuestos,
  getPuestoById,
  // Asignación
  asignarParqueadero,
  desasignarParqueadero,
  getParqueaderoByUnidad,
};
