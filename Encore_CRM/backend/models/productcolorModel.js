const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const ProductColorSchema = new mongooseSchema({
    product_Core_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    product_Color : {type: String, required: true},
    product_Color_Code : {type: String, required: true, unique: true},
    product_Color_Hex_Code : {type: String, required: true},
    product_Color_Special_Price : {type: String, default: "0"},
    product_Color_Status : {type: String, default: ""},
    product_Color_Ref_Id : {type: String, default: ""},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const ProductColor = mongoose.model('productcolor', ProductColorSchema);
module.exports = ProductColor;