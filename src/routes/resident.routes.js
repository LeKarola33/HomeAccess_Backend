/**
 * HomeAccess - Rutas del Portal de Residentes
 * Ruta: src/routes/resident.routes.js
 *
 * Todas las rutas requieren autenticación (protect)
 * y rol residente o propietario.
 *
 * GET /api/v1/resident/packages
 * GET /api/v1/resident/vehicles
 * GET /api/v1/resident/common-areas
 * GET /api/v1/resident/events
 */

const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  getMyPackages,
  getMyVehicles,
  getCommonAreas,
  getEvents,
} = require('../controllers/resident.controller');

const router = express.Router();

router.use(protect);
router.use(authorize('residente', 'propietario', 'admin'));

router.get('/packages',     getMyPackages);
router.get('/vehicles',     getMyVehicles);
router.get('/common-areas', getCommonAreas);
router.get('/events',       getEvents);

module.exports = router;