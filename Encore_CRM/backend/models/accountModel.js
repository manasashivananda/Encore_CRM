const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const AccountSchema = new mongooseSchema({
    account_UID : {type: String, required: true, unique: true},
    account_Name : {type: String, required: true},
    account_Address_line_one : {type: String, required: true, default: "Nil"},
    account_Address_line_two : {type: String, default: "Nil"},
    account_Address_Country : {type: String, required: true, default: "AU"},
    account_Address_State : {type: String, required: true, default: "Nil"},
    account_Address_City : {type: String, required: true, default: "Nil"},
    account_Address_PostalCode : {type: String, required: true, default: "Nil"},
    account_Address_Phone : {type: String, default: "Nil"},
    account_Address_Email : {type: String, default: "Nil"},
    account_StoreAddress: {type: String, default: "Nil"},
    account_Terms: {type: String, default: ""},
    account_Flashing_Item_Price_Assignment: {type: Boolean, default: false},
    account_Custom_Item_Price_Assignment: {type: Boolean, default: false},
    account_Status : {type: String, required: true, default: "active"},
    account_DataRemoved: {type: Boolean, default: false},
    accounts_Notes : {type:String},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Account = mongoose.model('accounts', AccountSchema);
module.exports = Account;