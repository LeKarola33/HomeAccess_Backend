const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  getMyPackages, getMyVehicles, getCommonAreas, getEvents, getMyUnit,
  getMyVisitors, registerVisitor, updateVisitor, cancelVisitor,
  marcarIngreso, marcarSalida, searchVisitors,
} = require('../controllers/resident.controller');

const router = express.Router();
router.use(protect);

const residentOnly = authorize('residente', 'propietario');
const allStaff     = authorize('residente', 'propietario', 'admin', 'portero');

router.get('/packages',              residentOnly, getMyPackages);
router.get('/vehicles',              residentOnly, getMyVehicles);
router.get('/common-areas',          allStaff,     getCommonAreas);
router.get('/events',                allStaff,     getEvents);
router.get('/my-unit',               residentOnly, getMyUnit);

router.get('/visitors',              residentOnly, getMyVisitors);
router.post('/visitors',             residentOnly, registerVisitor);
router.patch('/visitors/:id',        residentOnly, updateVisitor);
router.patch('/visitors/:id/cancel', residentOnly, cancelVisitor);

// Portero y admin pueden marcar ingreso/salida
router.patch('/visitors/:id/ingreso', allStaff, marcarIngreso);
router.patch('/visitors/:id/salida',  allStaff, marcarSalida);

// Búsqueda accesible por portero y admin
router.get('/visitors/search', allStaff, searchVisitors);

module.exports = router;