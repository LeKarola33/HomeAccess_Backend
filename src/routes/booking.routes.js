/**
 * HomeAccess - Booking Routes
 * GET    /api/v1/bookings                          → listar reservas
 * POST   /api/v1/bookings                          → crear reserva
 * PATCH  /api/v1/bookings/:id/estado               → aprobar/rechazar/cancelar (admin)
 * DELETE /api/v1/bookings/:id                      → cancelar (owner o admin)
 * GET    /api/v1/bookings/area/:area_id/disponibilidad?fecha= → franjas ocupadas
 */
const express = require('express');
const ctrl    = require('../controllers/booking.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/',                                    ctrl.getBookings);
router.post('/',                                   ctrl.createBooking);
router.get('/area/:area_id/disponibilidad',        ctrl.getDisponibilidad);
router.patch('/:id/estado', authorize('admin'),    ctrl.updateBookingStatus);
router.delete('/:id',                              ctrl.cancelBooking);

module.exports = router;
