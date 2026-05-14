const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  conjunto_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Complex' },
  area_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'CommonArea', required: true },
  unit_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  usuario_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fecha_inicio:  { type: Date, required: true },
  fecha_fin:     { type: Date, required: true },
  franja:        { type: String, default: '' },
  observaciones: { type: String, default: '' },
  estado:        { type: String, enum: ['pendiente','aprobada','rechazada','cancelada'], default: 'pendiente' },
  motivo_rechazo:{ type: String, default: '' },
}, { timestamps: true });

bookingSchema.index({ area_id: 1, fecha_inicio: 1 });
bookingSchema.index({ unit_id: 1, estado: 1 });

module.exports = mongoose.model('Booking', bookingSchema);