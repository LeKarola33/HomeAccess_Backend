/**
 * HomeAccess - Security Guard Routes
 * =====================================
 * All routes require: protect + authorize('securityguard', 'admin')
 *
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

// Roles allowed across all routes
const ALLOWED_ROLES = ['securityguard', 'admin'];

// Apply auth + authorization to ALL routes in this router
router.use(protect, authorize(...ALLOWED_ROLES));

// ── Access Logs / Visitors ────────────────────────────────────
router.get('/access-logs',         getAccessLogs);
router.get('/access-logs/active',  getActiveVisitors);
router.post('/access-logs/entry',  registerEntry);
router.post('/access-logs/exit',   registerExit);

// ── Packages ──────────────────────────────────────────────────
router.get('/packages',                  getPackages);
router.post('/packages',                 registerPackage);
router.patch('/packages/:id/deliver',    deliverPackage);
router.patch('/packages/:id/return',     returnPackage);

// ── Units (read-only) ─────────────────────────────────────────
router.get('/units', getUnits);

// ── Common Areas (read-only) ──────────────────────────────────
router.get('/common-areas', getCommonAreas);

// ── Parqueadero ───────────────────────────────────────────────
router.get('/parking',       getParking);
router.get('/parking-spots', getParkingSpots);

// ── Events (read-only) ───────────────────────────────────────
router.get('/events', getEvents);

module.exports = router;
