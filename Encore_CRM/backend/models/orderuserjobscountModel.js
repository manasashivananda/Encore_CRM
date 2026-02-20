const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const OrderUserJobsCountSchema = new mongooseSchema({
    Order_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    Order_UId : { type: String, default: 0},
    Order_User_Id  : {type: mongooseSchema.Types.ObjectId, required: true},
    Order_Dept_Code : { type: String, default: 0},
    Order_SubDept_Status : { type: String, default: 0},
    Order_Job_Count : { type: String, default: 0},
    created :{type: Date, default: Date.now},
});
const OrderUserJobsCount = mongoose.model('orderuserjobcounts', OrderUserJobsCountSchema);
module.exports = OrderUserJobsCount;