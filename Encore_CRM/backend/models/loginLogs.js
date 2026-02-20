const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const LoginLogsSchema = new mongooseSchema({
    user_id : {type: mongooseSchema.Types.ObjectId, required: true},
    timestamp : {type: Date},
    ip : { type: String },
    location : {
        country : { type: String },
        city: { type: String },
        region: { type: String },
        lat: { type: String },
        lng: { type: String },
        pin_code: { type: String },
        address: { type: String }
    },
    isSuspicious: { type: Boolean },
    login_time: {type: Date},
    logout_time: {type: Date},
    reason: { type: String },
    reviewed_by : {type: mongooseSchema.Types.ObjectId},
    reviewed: { type: Boolean },
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const LoginLogs = mongoose.model('login_logs', LoginLogsSchema);
module.exports = LoginLogs;