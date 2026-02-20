const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const LeftoverSchema = new mongooseSchema({
    deliveryDate : {type: Date, required: true},
    flashing : {type: Number, required: true},
    jobbing : {type: Number, required: true},
    faciaGutter : {type: Number, required: true},
    cladding : {type: Number, required: true},
    gbi : {type: Number, required: true},
    roofing : {type: Number, required: true},
    created :{type: Date, default: Date.now},
});
const Leftover = mongoose.model('leftovers', LeftoverSchema);
module.exports = Leftover;