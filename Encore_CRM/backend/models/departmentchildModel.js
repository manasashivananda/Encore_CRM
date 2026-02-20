const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const DepartmentChildSchema = new mongooseSchema({
    department_child_name : {type: String, required: true},
    department_child_parent_id : {type: mongooseSchema.Types.ObjectId, required: true},
    department_child_status : {type: String, default: ""},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const DepartmentChild = mongoose.model('departmentsubcategory', DepartmentChildSchema);
module.exports = DepartmentChild;