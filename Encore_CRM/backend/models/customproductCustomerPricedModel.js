const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const CustomProductCustomerPricedSchema = new mongooseSchema({
    custom_Product_Customer_id : {type: mongooseSchema.Types.ObjectId, required: true},
    custom_Product_Code : {type: String, required: true},
    custom_Product_Description : {type: String, default: ""},
    custom_Product_Class : {type: String, default: "Nil"},
    custom_Product_UOM : {type: String, required: true},
    custom_Product_Price : {type: Number, default: 0},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const CustomProductCustomerPriced = mongoose.model('customproductscustomerpriced', CustomProductCustomerPricedSchema);
module.exports = CustomProductCustomerPriced;