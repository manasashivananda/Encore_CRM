const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const LoginSchema = new mongooseSchema({
    user_ref_id: {type: mongooseSchema.Types.ObjectId, ref: 'users'},
    user_email: {type: String,required: true, unique: true},
    password : {type: String,required: true},
    token: { type: String },
	securityToken: {type:String},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
    expire_date_time : {type: Date},
    login_status: {type: Boolean, default: false}
});
const EncoreUsers = mongoose.model('loginusers', LoginSchema);
module.exports = EncoreUsers;