const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;
const QuoteItemMeSchema = new mongooseSchema({
    quote_master_me_id : {type: mongooseSchema.Types.ObjectId, required: true},
    quote_unique_me_id : {type: String, required: true},
    quote_item_unique_me_id : {type: String, required: true, default: 0},
    quote_item_me_code : {type: String, required: true, default: 0},
    quote_item_me_description : {type: String, required: true, default: 0},
    quote_item_me_department : {type: mongooseSchema.Types.ObjectId, required: true},
    quote_item_me_department_code : {type: String, required: true, default: 0},
    quote_item_me_length : {type: String, default: 0},
    quote_item_me_uom : {type: String, default: 0},
    quote_item_me_pieces : {type: String, default: 0},
    quote_item_qty_me_price : {type: String, default: 0},
    quote_item_special_me_price : {type: String, required: true, default: 0},
    quote_item_special_me_price_original : {type: Number, required: true, default: 0},
    quote_item_me_discount : {type: Number, required: true, default: 0},
    quote_item_me_discounted_amount : {type: Number, required: true, default: 0},
    quote_item_qty_me_discounted_price : {type: Number, required: true, default: 0},
    quote_item_me_discount : {type: Number, required: true, default: 0},
    quote_item_me_uom_value : {type: String, default: 0},
    quote_item_me_quantity : {type: String, default: 0},
    quote_item_me_flag : {type: String, required: true, default: "ME"},
    quote_item_me_user : {type: mongooseSchema.Types.ObjectId},
    created :{type: Date, default: Date.now},
    updated :{type: Date},
});
const QuoteItemMe = mongoose.model('quotesitemsmanual', QuoteItemMeSchema);
module.exports = QuoteItemMe;