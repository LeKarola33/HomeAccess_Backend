/**
 * HomeAccess - Rutas de Usuarios
 * ================================
 * GET    /api/v1/users          -> listar (admin)
 * GET    /api/v1/users/:id      -> detalle (admin o propio usuario)
 * PUT    /api/v1/users/:id      -> actualizar (admin o propio usuario)
 * DELETE /api/v1/users/:id      -> soft delete (admin)
 */

const express = require('express');
const userController = require('../controllers/user.controller');
const { protect, authorize, isSelfOrAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas de usuarios requieren autenticación
router.use(protect);

router.get('/',         authorize('admin'),    userController.getUsers);
router.post('/create',  authorize('admin'),    userController.createUser);   // ← Crear usuario (admin)
router.get('/:id',      isSelfOrAdmin,         userController.getUserById);
router.put('/:id',      isSelfOrAdmin,         userController.updateUser);
router.delete('/:id',   authorize('admin'),    userController.deleteUser);

module.exports = router;
