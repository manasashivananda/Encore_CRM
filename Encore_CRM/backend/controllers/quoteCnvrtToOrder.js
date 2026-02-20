async function conversionOfQTitemstoSOitems(orderquoteno, quoteMasID, ordersaleorderno, ordersaleorderid, orderflashingchecker) {
  let ManualItemAddingStatus = 0;
  let quoteMasDetails = await QuotationMaster.find({ _id: orderquoteno });
  if (quoteMasDetails) {
    if(!orderflashingchecker){
      let quoteCustomItems = await QuotationItemManual.find({ quote_master_me_id: orderquoteno });
      let quoteCustomItemsCount = quoteCustomItems.length;
      let indexCounter = 0;
      for (let i = 0; i < quoteCustomItemsCount; i++) {
        const NewIndex = indexCounter;
        indexCounter++;

        const orderItemObj = new OrderItemManual({
          order_row_index: NewIndex,
          order_master_me_id: ordersaleorderid,
          order_unique_me_id: ordersaleorderno,
          order_item_me_code: quoteCustomItems[i].quote_item_me_code,
          order_item_me_description: quoteCustomItems[i].quote_item_me_description,
          order_item_me_department: quoteCustomItems[i].quote_item_me_department,
          order_item_me_department_code: quoteCustomItems[i].quote_item_me_department_code,
          order_item_me_length: quoteCustomItems[i].quote_item_me_length,
          order_item_me_uom: quoteCustomItems[i].quote_item_me_uom,
          order_item_me_pieces: quoteCustomItems[i].quote_item_me_pieces,
          order_item_qty_me_price: quoteCustomItems[i].quote_item_qty_me_price,
          order_item_special_me_price: quoteCustomItems[i].quote_item_special_me_price,
          order_item_special_me_price_original: quoteCustomItems[i].quote_item_special_me_price_original,
          order_item_me_discount: quoteCustomItems[i].quote_item_me_discount,
          order_item_me_discounted_amount: quoteCustomItems[i].quote_item_me_discounted_amount,
          order_item_qty_me_discounted_price: quoteCustomItems[i].quote_item_qty_me_discounted_price,
          order_item_me_uom_value: quoteCustomItems[i].quote_item_me_uom_value,
          order_item_me_quantity: quoteCustomItems[i].quote_item_me_quantity,
          order_item_me_flag: quoteCustomItems[i].quote_item_me_flag,
          created: quoteCustomItems[i].created,
        });
        let OrderManualItems = await orderItemObj.save();
        if (OrderManualItems) {
          let DeptDetails = await Department.find({ _id: quoteCustomItems[i].quote_item_me_department });
          let DeptCode = DeptDetails[0].department_code;
          let updateData;
          if (DeptCode === "FG") {
            updateData = { $set: { fg_order_prod_push_status: "1" } };
          }
          if (DeptCode === "CL") {
            updateData = { $set: { cl_order_prod_push_status: "1" } };
          }
          if (DeptCode === "J") {
            updateData = { $set: { j_order_prod_push_status: "1" } };
          }
          if (DeptCode === "ROOF") {
            updateData = { $set: { roof_order_prod_push_status: "1" } };
          }
          if (DeptCode === "GBI") {
            updateData = { $set: { gbi_order_prod_push_status: "1" } };
          }
          if (DeptCode === "GBIL") {
            updateData = { $set: { gbil_order_prod_push_status: "1" } };
          }
          const conditions = { order_unique_id: ordersaleorderno };
          const quotestatus = await OrderMaster.findOneAndUpdate(conditions, updateData, attrs);
          if (quotestatus) {
            ManualItemAddingStatus = 1;
          }
        }
      }
      ManualItemAddingStatus = 1;
    }else{
      let quoteFlashinItems = await QuotationItem.find({ quote_unique_id: orderquoteno });
      let quoteFlashinItemsCount = quoteFlashinItems.length;
      for (let i = 0; i < quoteFlashinItemsCount; i++) {
        const NewIndex = indexCounter;
        indexCounter++;

        const orderItemObj = new OrderItem({
          order_row_index: NewIndex,
          order_master_id: ordersaleorderid, // newly created order master id
          order_unique_id: ordersaleorderno, // newly created order id/ myob id
          order_item_unique_id: job.JobID, // swi job id
          order_item_material: quoteFlashinItems[i].quote_item_material,
          order_item_color: quoteFlashinItems[i].quote_item_color,
          order_item_exact_grith: quoteFlashinItems[i].quote_item_exact_grith,
          order_item_round_grith: quoteFlashinItems[i].quote_item_round_grith,
          order_item_exact_fold: quoteFlashinItems[i].quote_item_exact_fold,
          order_item_fold: quoteFlashinItems[i].quote_item_fold,
          order_item_length: quoteFlashinItems[i].quote_item_length, // swi job length
          order_item_quantity: quoteFlashinItems[i].quote_item_quantity,
          order_item_pieces: quoteFlashinItems[i].quote_item_pieces,
          order_item_price: quoteFlashinItems[i].quote_item_price,
          order_item_qty_price: quoteFlashinItems[i].quote_item_qty_price,
          order_item_special_price: quoteFlashinItems[i].quote_item_special_price,
          order_item_special_price_original : quoteFlashinItems[i].quote_item_special_price_original,
          order_item_code: quoteFlashinItems[i].quote_item_code,
          order_item_description: quoteFlashinItems[i].quote_item_description,
          order_item_designer: quoteFlashinItems[i].quote_item_designer,
          order_item_flag: "DT",
          order_item_shape_id: quoteFlashinItems[i].quote_item_shape_id,
        });
        let OrderFlashingItems = await orderItemObj.save();
        if (OrderFlashingItems) {
         
          let DeptCode = "F";
          let updateData;

          updateData = { $set: { f_order_prod_push_status: "1" } };
          const conditions = { order_unique_id: ordersaleorderno };
          const orderStatus = await OrderMaster.findOneAndUpdate(conditions, updateData, attrs);
          // if (quotestatus) {
          //   ManualItemAddingStatus = 1;
          // }
        }
      }
      await RecalculateOrderItemsCountFn(ordersaleorderid);
      await RecalculateUserJobCountFn(ordersaleorderid, "F");
    }
    await RecalculateOverallOrderTotalFn(ordersaleorderid);
  } else {
    ManualItemAddingStatus = 0;
  }
  return ManualItemAddingStatus;
}