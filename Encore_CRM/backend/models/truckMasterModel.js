const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const TruckSchema = new mongooseSchema({
    name: { type: String, required: [true, 'Truck name is required'] },
    reg_no: { type: String, required: [true, 'Registration number is required'] },
    default_driver_id: { type: mongoose.Types.ObjectId, unique: true },
    location: { type: String, required: [true, 'Location is required'] },
    dimensions: {
        length: { type: Number, required: [true, 'Length is required'] },
        width: { type: Number, required: [true, 'Width is required'] },
        max_length: { type: Number, required: [true, 'Max Length is required'] }
    },
    type: { type: Number, required: [true, 'Type is required'] },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    created_date: { type: Date, default: Date.now },
    updated_date: { type: Date },
    status: { type: String, default: 'active' }
});
const Trucks = mongoose.model('trucks', TruckSchema);
module.exports = Trucks;