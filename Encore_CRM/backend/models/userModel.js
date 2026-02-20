const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const UserSchema = new mongooseSchema({
    user_firstName : {type: String, required: true},
    user_lastName : {type: String, required: true},
    user_Email: {type: String, required: true, unique: true},
    user_Phone : {type: String ,required: true, unique: true },
    user_Role : { type : [mongooseSchema.Types.ObjectId], required: true, ref: 'roles'},
    user_Designation : {type: String, required: true, default: "Nil" },
    user_status : {type: String, required: true },
    user_secretkey : {type: String, default: "" },
    is2FARegistered: { type: Boolean, default: false },
    user_DataRemoved: {
        type: Boolean,
        default: false
    },
    region: { type: String },
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Users = mongoose.model('users', UserSchema);
module.exports = Users;