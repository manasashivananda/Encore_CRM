const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const orderLineNumberSchema = new mongooseSchema({
    myob_Row_Id: { type: String, required: true },
    myob_Order_Id: { type: String, required: true },
    myob_Order_LineNumbers: [{
        lineNumber: { type: Number, required: true },
        id: { type: String, required: true }
    }],
    created: { type: Date, default: Date.now },
});
const orderLineNumber = mongoose.model('orderlinenumber', orderLineNumberSchema);
module.exports = orderLineNumber;