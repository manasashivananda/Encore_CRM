const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const OrderSubitemCountSchema = new mongooseSchema({
    Order_Mas_Id : {type: mongooseSchema.Types.ObjectId, unique: true, required: true},
    Order_Flashing_Count : { type: Number, default: 0},
    Order_Jobbing_Count : { type: Number, default: 0},
    Order_Cladding_Count : { type: Number, default: 0},
    Order_Faciagutter_Count : { type: Number, default: 0},
    Order_Roofing_Count : { type: Number, default: 0},
    Order_GBI_Count : { type: Number, default: 0},
    Order_GBIL_Count : { type: Number, default: 0},
    Order_Custom_Count : { type: Number, default: 0},
    created :{type: Date, default: Date.now},
});
const OrderSubitemCount = mongoose.model('orderssubitemcounts', OrderSubitemCountSchema);
module.exports = OrderSubitemCount;