const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const AccountContactSchema = new mongooseSchema({
    account_Id : {type: mongooseSchema.Types.ObjectId, required: true},
    account_CUID : {type: String, required: true},
    account_Contact_ContactID : {type: Number},
    account_Contact_FName : {type: String, required: true},
    account_Contact_LName : {type: String},
    account_Contact_Email : {type: String},
    account_Contact_Phone : {type: String},
    account_Contact_Status : {type: String, required: true, default: "active"},
    account_Contact_Type : {type: String, required: true, default: "Store"},
    account_Contact_DataRemoved: {type: Boolean, default: false},
    account_Contact_Verified : {type: Boolean, default: false},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const AccountContact = mongoose.model('accountcontacts', AccountContactSchema);
module.exports = AccountContact;