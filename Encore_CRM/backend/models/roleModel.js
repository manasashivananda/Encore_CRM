const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const RolesSchema = new mongooseSchema({
    role_Name : {type: String, required: true},
    role_status : {type: String, required: true},
    role_category : {type: String},
    depts : {type: [String]},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Roles = mongoose.model('roles', RolesSchema);
module.exports = Roles;