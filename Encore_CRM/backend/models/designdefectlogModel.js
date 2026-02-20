const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const DesignDefectLogSchema = new mongooseSchema({
    def_Order_Mas_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    def_Order_Mas_Unique_Id : {type: String, required: true},
    def_User_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    def_Design_Shape_Id : [{ type: String }],
    def_created :{type: Date, default: Date.now},
});
const DesignDefectLog = mongoose.model('designdefectlogs', DesignDefectLogSchema);
module.exports = DesignDefectLog;