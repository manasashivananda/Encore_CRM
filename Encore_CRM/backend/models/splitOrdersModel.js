const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const SplitOrdersSchema = new mongooseSchema({
    order_master_id : {type: mongooseSchema.Types.ObjectId, required: true},
    order_unique_id : {type: String, required: true, unique: true},
    order_customer_PO_number : {type: String, default: "0"},
    order_item_id : {type: [mongooseSchema.Types.ObjectId], required: true},
    order_item_manual_id : {type: [mongooseSchema.Types.ObjectId], required: true},
    order_delivery_date : {type: Date, required: true },
    order_delivery_date_str : {type: String, required: true },
    order_delivery_time : {type: String, required: true },
    order_delivery_session : {type: String },
    order_delivery_address_mode : {type: String, required: true },
    order_store_delivery_address1 : {type: String, default: "-"},
    order_store_delivery_address2 : {type: String, default: "-"},
    order_store_delivery_city : {type: String, default: "-"},
    order_store_delivery_country : {type: String, default: "AU"},
    order_store_delivery_postalcode : {type: String, default: "-"},
    order_store_delivery_state : {type: String, default: "VIC"},
    order_site_delivery_attention_person : {type: String, default: "-"},
    order_site_delivery_attention_contact : {type: String, default: "-"},
    order_site_delivery_address2 : {type: String, default: "-"},
    order_site_delivery_address1 : {type: String, default: "-"},
    order_site_delivery_address2 : {type: String, default: "-"},
    order_site_delivery_city : {type: String, default: "-"},
    order_site_delivery_country : {type: String, default: "AU"},
    order_site_delivery_postalcode : {type: String, default: "-"},
    order_site_delivery_state : {type: String, default: "VIC"},
    order_priority_status : {type: Number, default: 0},
    order_sales_comment : {type: String},
    order_comment_added_user :  {type: mongooseSchema.Types.ObjectId},
    order_comment_updated_user :  {type: mongooseSchema.Types.ObjectId},
    order_comment_attended_user :  {type: mongooseSchema.Types.ObjectId},
    info: {type: String},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
    created_by : {type: mongooseSchema.Types.ObjectId, required: true},
    updated_by : {type: mongooseSchema.Types.ObjectId}
});

const SplitOrders = mongoose.model('splitorders', SplitOrdersSchema);
module.exports = SplitOrders;