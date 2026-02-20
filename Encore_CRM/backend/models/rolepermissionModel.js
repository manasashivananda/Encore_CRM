const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;

const rolesPermissionInfoSchema = new mongooseSchema({
        Role_Id : { type: mongooseSchema.Types.ObjectId, required: true},
        Module_Id : { type: mongooseSchema.Types.ObjectId, required: true},
        Add_Perms : {type : String,required: false },
        Edit_Perms : {type : String,required: false },
        View_Perms : {type : String,required: false },
        created :{type: Date,default: Date.now}
});

const RolesPermissionInfo = mongoose.model('rolespermissioninfo', rolesPermissionInfoSchema);
module.exports = RolesPermissionInfo;