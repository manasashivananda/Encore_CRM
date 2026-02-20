const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const TruckMaintainanceSchema = new mongooseSchema({
    truck_id: { type: mongoose.Types.ObjectId, required: [true, 'Truck ID is required'] },
    from_date: { type: Date },
    to_date: { type: Date },
    description: { type: String },
    amt: { type: Number },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    created_date: { type: Date, default: Date.now },
    updated_date: { type: Date },
});
TruckMaintainanceSchema.index({ truck_id: 1 });
const TruckMaintainances = mongoose.model('truck_maintainances', TruckMaintainanceSchema);
module.exports = TruckMaintainances;