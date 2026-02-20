const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const ProductGirthSchema = new mongooseSchema({
    product_Girth : {type: Number, required: true, unique: true},
    product_Girth_Status : {type: String, default: ""},
    product_Girth_Order : {type: Number, default: 0},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const ProductGirth = mongoose.model('productgirth', ProductGirthSchema);
module.exports = ProductGirth;