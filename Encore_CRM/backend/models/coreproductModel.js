const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const CoreProductSchema = new mongooseSchema({
    core_Product_Name : {type: String, required: true, unique: true},
    core_Product_Thickness : {type: String, default: ""},
    core_Product_Ref_Id : {type: String, default: ""},
    core_Product_Status : {type: String, default: "active"},
    core_Product_Order : {type: Number, default: 0},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const CoreProduct = mongoose.model('coreproducts', CoreProductSchema);
module.exports = CoreProduct;