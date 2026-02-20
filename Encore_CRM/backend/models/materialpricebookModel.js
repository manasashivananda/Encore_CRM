const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const MaterialPriceSchema = new mongooseSchema({
    material_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    girth_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    fold_ID : { type: mongooseSchema.Types.ObjectId, required: true},
    price_Values : {type: String, required: true },
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const MaterialPrice = mongoose.model('materialprice', MaterialPriceSchema);
module.exports = MaterialPrice;