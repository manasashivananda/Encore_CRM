const mongoose = require('mongoose');
const mongooseSchema = mongoose.Schema;


const CustomerFeedbackSchema = new mongooseSchema({
    customer_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'accounts',
        required: true 
    },
    feedback_text: { 
        type: String, 
        required: true 
    },
    created: { 
        type: Date, 
        default: Date.now 
    },
    updated: { 
        type: Date 
    }
});

// Index for faster queries by customer_id
CustomerFeedbackSchema.index({ customer_id: 1, created: -1 });

const CustomerFeedback = mongoose.model('customer_feedbacks', CustomerFeedbackSchema);
module.exports = CustomerFeedback;