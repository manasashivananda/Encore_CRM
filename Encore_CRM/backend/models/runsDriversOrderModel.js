const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const RunsDriverOrderSchema = new mongooseSchema({
    order_nums : { type : [String], required: [true, "Order ID is required"]},
    driver_id : { type : mongooseSchema.Types.ObjectId},
    draft_driver : { type : String },
    truck_id: {type : mongooseSchema.Types.ObjectId},
    start_time : {type: String},
    run_type : {type: String},
    order: { type: Number },
    delivery_date :{type: Date, required: [true, "Delivery date is required"]},
    created_by :{type: mongooseSchema.Types.ObjectId, ref: 'users'},
    updated_by :{type: mongooseSchema.Types.ObjectId, ref: 'users'},
    created_date :{type: Date, default: Date.now},
    updated_date :{type: Date},
    status : {type: String, default: "active"}
});
RunsDriverOrderSchema.index({ drivers_id: 1, truck_id: 1 });
const RunsDriverOrders = mongoose.model('runsdriverorders', RunsDriverOrderSchema);
module.exports = RunsDriverOrders;