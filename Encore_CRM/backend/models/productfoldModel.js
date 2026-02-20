const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const ProductFoldSchema = new mongooseSchema({
    product_Fold : {type: String, required: true, unique: true},
    product_Fold_Status : {type: String, default: ""},
    product_Fold_Order : {type: Number, default: 0},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const ProductFold = mongoose.model('productfold', ProductFoldSchema);
module.exports = ProductFold;