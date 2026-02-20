const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const UserOrderSchema = new mongooseSchema({
    user_ID : {type: mongooseSchema.Types.ObjectId, required: true},
    user_Order_ID : {type: String, required: true},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const UserOrder = mongoose.model('userorder', UserOrderSchema);
module.exports = UserOrder;