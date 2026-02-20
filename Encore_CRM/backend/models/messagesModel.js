const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const MessagesSchema = new mongooseSchema({
    text :{type: String},
    depts : {type : [String]},
    created_by :{type: mongooseSchema.Types.ObjectId, ref: 'users'},
    updated_by :{type: mongooseSchema.Types.ObjectId, ref: 'users'},
    created_date :{type: Date, default: Date.now},
    updated_date :{type: Date},
    status : {type: String, default: "pending"}
});
const Messages = mongoose.model('messages', MessagesSchema);
module.exports = Messages;