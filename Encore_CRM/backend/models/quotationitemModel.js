const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const QuoteItemSchema = new mongooseSchema({
    quote_master_id : {type: mongooseSchema.Types.ObjectId, required: true},
    quote_unique_id : {type: String, required: true},
    quote_item_unique_id : {type: String, required: true},
    quote_item_shape_id : {type: String, required: true, default: 0},
    quote_item_material : {type: mongooseSchema.Types.ObjectId, required: true},
    quote_item_color : {type: mongooseSchema.Types.ObjectId, required: true},
    quote_item_exact_grith : {type: String},
    quote_item_round_grith : {type: mongooseSchema.Types.ObjectId},
    quote_item_exact_fold : {type: String},
    quote_item_fold : {type: mongooseSchema.Types.ObjectId},
    quote_item_length : {type: String, required: true, default: 0},
    quote_item_quantity : {type: String, required: true, default: 0},
    quote_item_pieces : {type: String, required: true, default: 0},
    quote_item_price : {type: String, required: true, default: 0},
    quote_item_qty_price : {type: String, required: true, default: 0},
    quote_item_special_price : {type: String, required: true, default: 0},
    quote_item_special_price_original : {type: Number, required: true, default: 0},
    quote_item_discount : {type: Number, required: true, default: 0},
    quote_item_discounted_amount : {type: Number, required: true, default: 0},
    quote_item_qty_discounted_price : {type: Number, required: true, default: 0},
    quote_item_code : {type: String, required: true, default: 0},
    quote_item_description : {type: String, required: true, default: 0},
    quote_item_flag : {type: String, required: true, default: "DT"},
    quote_item_user : {type: mongooseSchema.Types.ObjectId},
    quote_item_status_tracker : { type : mongooseSchema.Types.Mixed},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
    quote_item_designer : {type: mongooseSchema.Types.ObjectId, required: true},
});
const QuoteItem = mongoose.model('quoteitems', QuoteItemSchema);
module.exports = QuoteItem;