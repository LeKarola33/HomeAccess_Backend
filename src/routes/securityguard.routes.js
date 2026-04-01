/**
 * HomeAccess - Rutas del Portal de Portería
 * Base: /api/v1/securityguard
 */

const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  getAccessLogs, getActiveVisitors, registerEntry, registerExit,
  getPackages, registerPackage, deliverPackage, returnPackage,
  getUnits, getCommonAreas, getParking, getParkingSpots, getEvents,
} = require('../controllers/securityguard.controller');

// Rol unificado: portero (antes securityguard/vigilante)
const ALLOWED_ROLES = ['portero', 'admin'];

router.use(protect, authorize(...ALLOWED_ROLES));

router.get('/access-logs',         getAccessLogs);
router.get('/access-logs/active',  getActiveVisitors);
router.post('/access-logs/entry',  registerEntry);
router.post('/access-logs/exit',   registerExit);

router.get('/packages',                getPackages);
router.post('/packages',               registerPackage);
router.patch('/packages/:id/deliver',  deliverPackage);
router.patch('/packages/:id/return',   returnPackage);

router.get('/units',        getUnits);
router.get('/common-areas', getCommonAreas);
router.get('/parking',       getParking);
router.get('/parking-spots', getParkingSpots);
router.get('/events',        getEvents);

module.exports = router;