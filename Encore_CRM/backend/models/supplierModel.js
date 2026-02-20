const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const SupplierSchema = new mongooseSchema({
    sply_OrderID : {type: mongooseSchema.Types.ObjectId, required: true},
    sply_Added_User : {type: mongooseSchema.Types.ObjectId, required: true},
    sply_Added_Content : {type: String},
    sply_Added_Images_Keys: [{ type: String }],
    sply_Added_Index : {type: Number, required: true},
    sply_Added_Status : {type: String},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Supplier = mongoose.model('supplier', SupplierSchema);
module.exports = Supplier;