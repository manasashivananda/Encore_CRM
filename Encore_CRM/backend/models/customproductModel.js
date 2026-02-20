const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const CustomProductSchema = new mongooseSchema({
    custom_Product_Code : {type: String, required: true, unique: true},
    custom_Product_Description : {type: String, default: ""},
    custom_Product_Class : {type: String, default: "Nil"},
    custom_Product_UOM : {type: String, required: true},
    custom_Product_Price : {type: Number, default: 0},
    is_Flashing : { type: Boolean, default: false },
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const CustomProduct = mongoose.model('customproducts', CustomProductSchema);
module.exports = CustomProduct;