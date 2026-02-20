const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const CustomerMaterialPriceSchema = new mongooseSchema({
    customer_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    material_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    girth_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    fold_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    price_Values : {type: String, required: true },
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const CustomerMaterialPrice = mongoose.model('customermaterialprice', CustomerMaterialPriceSchema);
module.exports = CustomerMaterialPrice;