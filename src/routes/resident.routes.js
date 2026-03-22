const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  getMyPackages, getMyVehicles, getCommonAreas, getEvents,
  getMyVisitors, registerVisitor, cancelVisitor, searchVisitors,
} = require('../controllers/resident.controller');

const router = express.Router();
router.use(protect);
router.use(authorize('residente', 'propietario', 'admin'));

router.get('/packages',     getMyPackages);
router.get('/vehicles',     getMyVehicles);
router.get('/common-areas', getCommonAreas);
router.get('/events',       getEvents);

router.get('/visitors',              getMyVisitors);
router.post('/visitors',             registerVisitor);
router.patch('/visitors/:id/cancel', cancelVisitor);
router.get('/visitors/search',       searchVisitors);

module.exports = router;