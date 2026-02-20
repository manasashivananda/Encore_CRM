const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const CitySchema = new mongooseSchema({
    city_Name : {type: String, required: true, unique: true},
    city_State : {type: String, required: true},
    city_Country : {type: String, required: true},
    city_Pincode : {type: String, required: true},
    city_FarSuburb : {type: Boolean, required: true, default: false},
    city_Rack : {type: String, required: true},
    city_Status : {type: String, required: true},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const City = mongoose.model('cities', CitySchema);
module.exports = City;