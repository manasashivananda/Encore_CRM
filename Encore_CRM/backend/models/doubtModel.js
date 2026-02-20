const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const DoubtsSchema = new mongooseSchema({
    dbt_OrderID : {type: mongooseSchema.Types.ObjectId, required: true},
    dbt_Added_User : {type: mongooseSchema.Types.ObjectId, required: true},
    dbt_Added_Content : {type: String},
    dbt_Added_Images_Keys: [{ type: String }],
    dbt_Added_Index : {type: Number, required: true},
    dbt_Added_Status : {type: String},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Doubts = mongoose.model('doubts', DoubtsSchema);
module.exports = Doubts;