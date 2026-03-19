/**
 * HomeAccess - Parking Spot Model
 * =================================
 * Security guards can VIEW parking status.
 */

const mongoose = require('mongoose');

const parkingSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: [true, 'Parking number is required'],
      trim: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ['car', 'motorcycle', 'bicycle', 'accessible'],
      default: 'car',
    },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'maintenance'],
      default: 'available',
    },
    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    vehicle_plate: {
      type: String,
      trim: true,
      uppercase: true,
    },
    vehicle_brand: { type: String, trim: true },
    vehicle_color: { type: String, trim: true },
    active:        { type: Boolean, default: true },
    notes:         { type: String, trim: true },
  },
  { timestamps: true }
);

parkingSchema.index({ status: 1 });
parkingSchema.index({ vehicle_plate: 1 });

const Parking = mongoose.model('Parking', parkingSchema);
module.exports = Parking;
