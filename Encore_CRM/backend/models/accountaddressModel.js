const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const AccountAddressSchema = new mongooseSchema({
    account_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    account_CUID : {type: String, required: true},
    account_Site_Address_line_one : {type: String, required: true},
    account_Site_City : {type: String, required: true},
    account_Site_State : {type: String , required: true},
    account_Site_Country : {type: String, required: true},
    account_Site_Postalcode : {type: String, required: true},
    account_Site_Notes : {type: String},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
    //code change by rahul
    account_Site_Details : {type: String},
    account_Mud_Map : {type: String},
});
const AccountAddress = mongoose.model('accountaddresses', AccountAddressSchema);
module.exports = AccountAddress;