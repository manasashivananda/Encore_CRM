const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const QuoteDesignDefectLogSchema = new mongooseSchema({
    def_Quote_Mas_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    def_Quote_Mas_Unique_Id : {type: String, required: true},
    def_User_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    def_Design_Shape_Id : [{ type: String }],
    def_created :{type: Date, default: Date.now},
});
const QuoteDesignDefectLog = mongoose.model('quotedesigndefectlogs', QuoteDesignDefectLogSchema);
module.exports = QuoteDesignDefectLog;