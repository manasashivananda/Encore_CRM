const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const DepartmentSchema = new mongooseSchema({
    department_name : {type: String, required: true, unique: true},
    department_order : {type: Number, required: true, unique: true},
    department_code : {type: String, default: ""},
    department_status : {type: String, default: ""},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Department = mongoose.model('department', DepartmentSchema);
module.exports = Department;