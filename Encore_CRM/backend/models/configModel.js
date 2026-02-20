const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const ConfigSchema = new mongooseSchema({
    name : {type: String, required: true},
    lat : {type: String, required: true},
    lon: {type: String, required: true},
    region : {type: String ,required: true},
    allowed_radius : {type: String, required: true, default: "Nil" },
    created_by: {type: mongooseSchema.Types.ObjectId, required: true},
    updated_by : {type: mongooseSchema.Types.ObjectId },
    created_date :{type: Date, default: Date.now},
    updated_date :{type: Date},
    status: {type: String, required: true, default: "active"}
});
ConfigSchema.index({ 
    user_Role: 1, 
})
const Configs = mongoose.model('configs', ConfigSchema);
module.exports = Configs;