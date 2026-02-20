const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const RunsDriversSchema = new mongooseSchema({
    delivery_date :{type: Date, required: [true, "Delivery date is required"]},
    drivers_id : { type : [mongooseSchema.Types.ObjectId] },
    draft_drivers : { type : [String] },
    run_type : {type: String},
    created_by :{type: mongooseSchema.Types.ObjectId, ref: 'users'},
    updated_by :{type: mongooseSchema.Types.ObjectId, ref: 'users'},
    created_date :{type: Date, default: Date.now},
    updated_date :{type: Date},
    status : {type: String, default: "active"}
});
RunsDriversSchema.index({ drivers_id: 1 });
const RunsDrivers = mongoose.model('runsdrivers', RunsDriversSchema);
module.exports = RunsDrivers;