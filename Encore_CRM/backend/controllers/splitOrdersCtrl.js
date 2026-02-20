const mongoose = require('mongoose');
const express = require('express');
const app = express();
const PDFDocument1 = require("pdfkit-table");
const { logError } = require('../logger');

const OrderMaster = require('../models/ordermasterModel');
const OrderItem = require('../models/orderitemModel');
const OrderItemManual = require('../models/orderitemmanualModel');
const SplitOrders = require('../models/splitOrdersModel')
const { handleMongooseError, formatDateString, computeOrderFields } = require('./common');
const Account = require('../models/accountModel');


exports.addSplitOrders = async (req, res) => {
    try {
        const { order_id, order_unique_id, no_of_split } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user.user_ref_id);

        const master_order = await OrderMaster.find({ _id: order_id });
        // Find related OrderItem and OrderItemManual records
        const orderItems = await OrderItem.find({ order_master_id: order_id }, '_id');
        const orderItemManuals = await OrderItemManual.find({ order_master_me_id: order_id }, '_id');

        if(!master_order.length){
            res.status(200).json({
                status: false,
                message: 'Order not found'
            });
            return;
        }

        // Prepare arrays of ObjectIds
        const order_item_ids = orderItems.map(item => item._id);
        const order_item_manual_ids = orderItemManuals.map(item => item._id);

        // Generate order_unique_ids like IN1234A, IN1234B, etc.
        // Extract base from order_id or use a default
        const baseOrderUniqueId = typeof order_unique_id === 'string' ? computeOrderFields({order_unique_id: order_unique_id, order_customer_PO_number: master_order[0].order_customer_PO_number, order_customer_UID: master_order[0]?.order_customer_UID}).order_unique_id : 'IN1234';
        const order_unique_ids = Array.from({ length: no_of_split }, (_, i) =>
            `${baseOrderUniqueId}${String.fromCharCode(65 + i)}`
        );

        // Insert multiple split orders
        const splitOrders = [];
        for (let i = 0; i < no_of_split; i++) {
            const splitOrder = new SplitOrders({
                order_master_id: order_id,
                order_unique_id: order_unique_ids[i],
                order_customer_PO_number : computeOrderFields(master_order[0]).order_customer_PO_number,
                order_item_id: order_item_ids,
                order_item_manual_id: order_item_manual_ids,
                order_delivery_date : master_order[0].order_delivery_date,
                order_delivery_date_str: master_order[0].order_delivery_date_str,
                order_delivery_time: master_order[0].order_delivery_time,
                order_delivery_session: master_order[0].order_delivery_session,
                order_delivery_address_mode: master_order[0].order_delivery_address_mode,
                order_store_delivery_address1: master_order[0].order_store_delivery_address1,
                order_store_delivery_address2: master_order[0].order_store_delivery_address2,
                order_store_delivery_city: master_order[0].order_store_delivery_city,
                order_store_delivery_country: master_order[0].order_store_delivery_country,
                order_store_delivery_postalcode: master_order[0].order_store_delivery_postalcode,
                order_store_delivery_state: master_order[0].order_store_delivery_state,
                order_site_delivery_attention_person: master_order[0].order_site_delivery_attention_person,
                order_site_delivery_attention_contact: master_order[0].order_site_delivery_attention_contact,
                order_site_delivery_address2: master_order[0].order_site_delivery_address2,
                order_site_delivery_address1: master_order[0].order_site_delivery_address1,
                order_site_delivery_address2: master_order[0].order_site_delivery_address2,
                order_site_delivery_city: master_order[0].order_site_delivery_city,
                order_site_delivery_country: master_order[0].order_site_delivery_country,
                order_site_delivery_postalcode: master_order[0].order_site_delivery_postalcode,
                order_site_delivery_state: master_order[0].order_site_delivery_state,
                order_priority_status: master_order[0].order_priority_status,
                created: new Date(),
                created_by: userId,
            });
            await splitOrder.save();
            splitOrders.push(splitOrder);
        }

        // Update the split field in OrderMaster to true
        await OrderMaster.updateOne(
            { _id: order_id },
            { $set: { split: 1 } }
        );

        res.status(201).json({
            status: true,
            message: 'Order splitted successfully',
            data: splitOrders,
        });
    } catch (err) {
        logError("addSplitOrders", err, req.user.user_ref_id);
        handleMongooseError(err, res);
    }
}

exports.fetchSplitOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
            status: false,
            message: 'order_master_id is required'
            });
        }

        // Find all split orders for the given order_master_id
        const splitOrders = await SplitOrders.find({ order_master_id: id });

        if (!splitOrders.length) {
            return res.status(404).json({
            status: false,
            message: 'No split orders found for this order_master_id'
            });
        }

        // For each split order, fetch related OrderItems and OrderItemManuals
        const details = await Promise.all(splitOrders.map(async (splitOrder) => {
            const orderItems = await OrderItem.find({
            _id: { $in: splitOrder.order_item_id }
            });

            const orderItemManuals = await OrderItemManual.find({
            _id: { $in: splitOrder.order_item_manual_id }
            });

            return {
            splitOrder,
            orderItems,
            orderItemManuals
            };
        }));

        res.status(200).json({
            status: true,
            message: 'Split orders details fetched successfully',
            data: details
        });
    } catch (err) {
        logError("fetchSplitOrderDetails", err, req.user?.user_ref_id);
        handleMongooseError(err, res);
    }
}
exports.updateSplitOrderLineId = async (req, res) => {
  try {
    const { order_master_id, updates = [] } = req.body;

    if (!order_master_id || !updates.length) {
      return res.status(400).json({
        status: false,
        message: "order_master_id and updates array are required"
      });
    }

    const bulkOps = updates.map((u) => {
      if (!u.split_order_id) return null;

      const setOps = {};
      if (Array.isArray(u.order_item_ids)) {
        setOps.order_item_id = u.order_item_ids; // ✅ keep only checked items
      }
      if (Array.isArray(u.order_item_manual_ids)) {
        setOps.order_item_manual_id = u.order_item_manual_ids; // ✅ keep only checked items
      }

      if (!Object.keys(setOps).length) return null;

      return {
        updateOne: {
          filter: {
            order_master_id: new mongoose.Types.ObjectId(order_master_id),
            _id: new mongoose.Types.ObjectId(u.split_order_id)
          },
          update: { $set: setOps }
        }
      };
    }).filter(Boolean);

    if (!bulkOps.length) {
      return res.status(400).json({
        status: false,
        message: "No valid updates provided"
      });
    }

    // ✅ Apply updates to SplitOrders
    const result = await SplitOrders.bulkWrite(bulkOps);

    // ✅ Mark order master as "split updated"
    await OrderMaster.updateOne(
      { _id: new mongoose.Types.ObjectId(order_master_id) },
      { $set: { split: 2 } }
    );

    res.status(200).json({
      status: true,
      message: "Split orders updated successfully",
      data: result
    });
  } catch (err) {
    logError("fetchSplitOrderDetails", err, req.user?.user_ref_id);
    handleMongooseError(err, res);
  }
};

exports.updateSplitOrderDetailsBySplitId = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
            status: false,
            message: 'id is required'
            });
        }

        // Find all split orders for the given order_master_id
        const splitId = new mongoose.Types.ObjectId(id);
        const splitOrders = await SplitOrders.findOne({ _id: splitId });

        if (!splitOrders) {
            return res.status(404).json({
            status: false,
            message: 'No split orders found.'
            });
        }

        const masterOrder = await OrderMaster.findOne({ _id: splitOrders.order_master_id})

        let ordAccountDetails = await Account.find({ _id: masterOrder.order_customer_id });

        const orderdeliverydate = req.body.order_delivery_date;
        const orderdeliveryaddressmode = req.body.order_delivery_address_mode;
        let orderdeliverytime = req.body.order_delivery_time;
        let orderdeliverysession = req.body.order_delivery_session;
        let info = req.body.info;
        let ordersitedeliveryattentionperson;
        let ordersitedeliveryattentioncontact;
        let ordersitedeliveryaddress1;
        let ordersitedeliveryaddress2;
        let ordersitedeliverycity;
        let ordersitedeliverycountry;
        let ordersitedeliverypostalcode;
        let ordersitedeliverystate;
        let orderstoredeliveryaddress1;
        let orderstoredeliveryaddress2;
        let orderstoredeliverycity;
        let orderstoredeliverycountry;
        let orderstoredeliverypostalcode;
        let orderstoredeliverystate;

        if (orderdeliveryaddressmode == 0) {
            orderstoredeliveryaddress1 = req.body.order_store_delivery_address1;
            orderstoredeliveryaddress2 = req.body.order_store_delivery_address2;
            orderstoredeliverycity = req.body.order_store_delivery_city;
            orderstoredeliverycountry = req.body.order_store_delivery_country;
            orderstoredeliverypostalcode = req.body.order_store_delivery_postalcode;
            orderstoredeliverystate = req.body.order_store_delivery_state;
        } 
        if (orderdeliveryaddressmode == 1) {
            ordersitedeliveryattentionperson = req.body.order_site_delivery_attention_person;
            ordersitedeliveryattentioncontact = req.body.order_site_delivery_attention_contact;
            ordersitedeliveryaddress1 = req.body.order_site_delivery_address1;
            ordersitedeliveryaddress2 = req.body.order_site_delivery_address2;
            ordersitedeliverycity = req.body.order_site_delivery_city;
            ordersitedeliverycountry = req.body.order_site_delivery_country;
            ordersitedeliverypostalcode = req.body.order_site_delivery_postalcode;
            ordersitedeliverystate = req.body.order_site_delivery_state;
            orderstoredeliveryaddress1 = ordAccountDetails[0].account_Address_line_one;
            orderstoredeliveryaddress2 = ordAccountDetails[0].account_Address_line_two;
            orderstoredeliverycity = ordAccountDetails[0].account_Address_City;
            orderstoredeliverycountry = ordAccountDetails[0].account_Address_Country;
            orderstoredeliverypostalcode = ordAccountDetails[0].account_Address_PostalCode;
            orderstoredeliverystate = ordAccountDetails[0].account_Address_State;
        } 
        if (orderdeliveryaddressmode == 2) {
            ordersitedeliveryattentionperson = req.body.order_site_delivery_attention_person;
            ordersitedeliveryattentioncontact = req.body.order_site_delivery_attention_contact;
            orderstoredeliveryaddress1 = ordAccountDetails[0].account_Address_line_one;
            orderstoredeliveryaddress2 = ordAccountDetails[0].account_Address_line_two;
            orderstoredeliverycity = ordAccountDetails[0].account_Address_City;
            orderstoredeliverycountry = ordAccountDetails[0].account_Address_Country;
            orderstoredeliverypostalcode = ordAccountDetails[0].account_Address_PostalCode;
            orderstoredeliverystate = ordAccountDetails[0].account_Address_State;
        }

        let formattedDate = formatDateString(orderdeliverydate);

        if (orderdeliverytime && orderdeliverytime.trim() === "12.00 AM") {
            orderdeliverysession = "A/T";
            } else if (
                orderdeliverytime &&
                orderdeliverytime.trim() !== "12.00 AM" &&
                orderdeliverysession !== "B4" &&
                orderdeliverysession !== "Aft"
            ) {
                orderdeliverysession = "";
        }

        let timeOnlyStr = orderdeliverytime.replace(/ AM| PM/i, '').trim();
        if(orderdeliverysession === "A/T"){
            timeOnlyStr = "A/T"
        }else{
            timeOnlyStr = orderdeliverytime;
        }

        const updateData = {
          $set: {
            order_delivery_date: orderdeliverydate,
            order_delivery_date_str: formattedDate,
            order_delivery_time: orderdeliverytime,
            order_delivery_session: orderdeliverysession,
            order_delivery_address_mode: orderdeliveryaddressmode,
            order_site_delivery_attention_person: ordersitedeliveryattentionperson,
            order_site_delivery_attention_contact: ordersitedeliveryattentioncontact,
            order_site_delivery_address1: ordersitedeliveryaddress1,
            order_site_delivery_address2: ordersitedeliveryaddress2,
            order_site_delivery_city: ordersitedeliverycity,
            order_site_delivery_country: ordersitedeliverycountry,
            order_site_delivery_postalcode: ordersitedeliverypostalcode,
            order_site_delivery_state: ordersitedeliverystate,
            order_store_delivery_address1 : orderstoredeliveryaddress1,
            order_store_delivery_address2 : orderstoredeliveryaddress2,
            order_store_delivery_city : orderstoredeliverycity,
            order_store_delivery_country : orderstoredeliverycountry,
            order_store_delivery_postalcode : orderstoredeliverypostalcode,
            order_store_delivery_state : orderstoredeliverystate,
            info
          },
      };

      const conditions = { _id: splitId };
      updatedOrderInfo = await SplitOrders.findByIdAndUpdate(conditions, updateData);

      // For each split order, fetch related OrderItems and OrderItemManuals
      res.status(200).json({
          status: true,
          message: 'Split orders updated successfully',
          data: updatedOrderInfo
      });
    } catch (err) {
        logError("updateSplitOrderDetailsBySplitId", err, req.user?.user_ref_id);
        handleMongooseError(err, res);
    }
}







