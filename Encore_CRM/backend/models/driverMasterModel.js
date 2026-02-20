const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const DriverSchema = new mongooseSchema({
    name : {type: String, required: [true, 'Name is required']},
    phone : {type: String, required: [true, 'Phone is required'], unique: true},
    email: {type: String, required: [true, 'Email is required'], unique: true},
    work_location: {type: String, required: [true, 'Work location is required']},
    driver_type: {type: Number, required: [true, 'Driver type is required']},
    address : {type: String, required: [true, 'Address is required']},
    created_by : {type: mongoose.Schema.Types.ObjectId, ref: 'users', required: [true, 'Created by is required']},
    updated_by : {type: mongoose.Schema.Types.ObjectId, ref: 'users'},
    created_date :{type: Date, default: Date.now},
    updated_date :{type: Date},
    status : {type: String, default: 'active'},
    onWork : {type: Boolean, default: false}
});
const Drivers = mongoose.model('drivers', DriverSchema);
module.exports = Drivers;