const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const ExternalOrdersSchema = new mongooseSchema({
    order_number : {type: String, required: [true, "Order number is required."], unique: true},
    order_customer_name : {type: String, required: [true, "Customer name is required."] },
    order_customer_po_number : {type: String, required: [true, "Customer PO number is required."] },
    order_delivery_date : {type: Date, required: [true, "Delivery date is required."] },
    order_delivery_time : {type: String, required: [true, "Delivery time is required."] },
    order_delivery_session : {type: String },
    order_overall_price : {type: String, required: [true, "Total Price is required."], default: "0" },
    order_city : {type: String, required: [true, "City is required."]},
    order_country : {type: String, default: "AU"},
    order_postal_code : {type: String, required:[true, "Postal code is required."]},
    order_state : {type: String, default: "VIC"},
    order_type : {type: String, default: "External"},
    order_delivery_address : {type: String, required:[true, "Delivery Address is required."]},
    order_docket: [{ type: String }],
    order_created_person : {type: mongooseSchema.Types.ObjectId},
    order_updated_person : {type: mongooseSchema.Types.ObjectId},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
    order_crane_lift_checker : {type: Boolean, default: false},
    order_loaders_info: {type: String},
    order_drivers_info: {type: String},
    order_master_rack: {type: String},
    order_length: {type: String, required:[true, "Length is required."]},
    order_priority_status : {type: Number, default: 0},
    order_sales_comment : {type: String},
    order_comment_added_user :  {type: mongooseSchema.Types.ObjectId},
    order_comment_updated_user :  {type: mongooseSchema.Types.ObjectId},
    order_comment_attended_user :  {type: mongooseSchema.Types.ObjectId},
});
const ExternalOrders = mongoose.model('external_orders', ExternalOrdersSchema);
module.exports = ExternalOrders;