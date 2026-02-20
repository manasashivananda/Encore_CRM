const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const RackingSchema = new mongooseSchema({
    rack_name : {type: String, required: true, unique: true},
    rack_code : {type: String, default: ""},
    rack_status : {type: String, default: ""},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Racking = mongoose.model('rackings', RackingSchema);
module.exports = Racking;