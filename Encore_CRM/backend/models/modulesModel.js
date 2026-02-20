const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const ModulesSchema = new mongooseSchema({
    modules_Name : {type: String, required: true},
    modules_Alias : {type: String, default: "Nil"},
    modules_Status : {type: String, required: true},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const Modules = mongoose.model('modules', ModulesSchema);
module.exports = Modules;