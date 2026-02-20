const OrderMaster = require('../models/ordermasterModel');
const Template = require('../models/templateModel');
const MaterialRow = require('../models/materialRowModel');
// Quotation code
const QuotationMaster = require("../models/quotationmasterModel");

const { computeOrderFields } = require('./common');

async function buildDrawingsForOrder(orderNumber) {
  const templates = await Template.find({ 
    orderNumber: orderNumber,
    swiJobIds: {
      $exists: true,
      $type: 'array',
      $ne: []
    },
    $expr: { $gt: [ { $size: "$swiJobIds" }, 0 ] }
   }).lean();

  const templateMap = new Map(templates.map(t => [t._id.toString(), t]));
  const templateIds = [...templateMap.keys()];

  const rows = await MaterialRow.find({
    templateId: { $in: templateIds }
  }).lean();

  if (rows.length === 0 && templates.length > 0) {
    return templates
      .map(async template => ({
        id: template._id,
        templateId: template._id,
        name: template.name || '',
        material: template.material || '',
        color: template.color || '',
        thickness: template.thickness || '',
        girth: template.girth || (Array.isArray(template.lengths) ? template.lengths.reduce((a, b) => a + b, 0) : 0),
        qty: template.qty || 0,
        splitInto: template.splitInto || null,
        splitLength: template.splitLength || null,
        tag: template.tag || '',
        unitPrice: template.unitPrice || 0,
        extPrice: 0,
        preview: template.preview || '',
        previewUrl: "",
        previewFar: template.previewFar || '',
        previewFarUrl: "",
        previewNear: template.previewNear || '',
        previewNearUrl: "",
        lengths: template.lengths || [],
        angles: template.angles || [],
        farLengths: template.lengths || [],
        farAngles: template.angles || [],
        nearLengths: template.isTaper === true ? (template.nearLengths || []) : [],
        nearAngles: template.isTaper === true ? (template.nearAngles || []) : [],
        isTaper: template.isTaper === true,
        direction: template.direction || 'Right',
        reverseColor: template.reverseColor ?? true,
        partGroup: template.partGroup || '',
        partClass: template.partClass || '',
        swiJobIds: template.swiJobIds || [],
        startFoldType: template.startFoldType || null,
        startFoldDirection: template.startFoldDirection || null,
        startFoldLength: template.startFoldLength || null,
        startFoldGap: template.startFoldGap || null,
        endFoldType: template.endFoldType || null,
        endFoldDirection: template.endFoldDirection || null,
        endFoldLength: template.endFoldLength || null,
        endFoldGap: template.endFoldGap || null,
        girthStartFoldType: template.girthStartFoldType || null,
        girthEndFoldType: template.girthEndFoldType || null,
        // Flip and orientation states
        flipH: template.flipH || false,
        flipV: template.flipV || false,
        firstSegmentAngle: template.firstSegmentAngle,
        labelOffsets: template.labelOffsets || {}
      }));
  }

  const templateGroups = {};
  rows.forEach(row => {
    const templateId = row.templateId.toString();
    if (!templateGroups[templateId]) {
      templateGroups[templateId] = [];
    }
    templateGroups[templateId].push(row);
  });

  const results = await Promise.all(Object.entries(templateGroups).map(async ([templateId, templateRows]) => {
    const template = templateMap.get(templateId) || {};
    const firstRow = templateRows[0] || {};

    return {
      id: template._id,
      templateId: template._id,
      name: template.name || '',
      material: firstRow.material || template.material || '',
      color: firstRow.color || template.color || '',
      thickness: template.thickness || '',
      girth: template.girth || (Array.isArray(template.lengths) ? template.lengths.reduce((a, b) => a + b, 0) : 0),
      materialRows: templateRows.map(row => ({
        _id: row._id,
        qty: row.quantity || 0,
        length: row.length || 0,
        tag: row.tag || '',
        unitPrice: row.unitPrice || 0,
        extPrice: row.extPrice || 0,
        splitInto: row.splitInto || null,
        splitLength: row.splitLength || null
      })),
      preview: template.preview || '',
      previewUrl: "",
      previewFar: template.previewFar || '',
      previewFarUrl: "",
      previewNear: template.previewNear || '',
      previewNearUrl: "",
      lengths: template.lengths || [],
      angles: template.angles || [],
      farLengths: template.lengths || [],
      farAngles: template.angles || [],
      nearLengths: template.isTaper === true ? (template.nearLengths || []) : [],
      nearAngles: template.isTaper === true ? (template.nearAngles || []) : [],
      isTaper: template.isTaper === true,
      direction: template.direction || 'Right',
      reverseColor: template.reverseColor ?? true,
      partGroup: template.partGroup || '',
      partClass: template.partClass || '',
      swiJobIds: template.swiJobIds || [],
      startFoldType: template.startFoldType || null,
      startFoldDirection: template.startFoldDirection || null,
      startFoldLength: template.startFoldLength || null,
      startFoldGap: template.startFoldGap || null,
      endFoldType: template.endFoldType || null,
      endFoldDirection: template.endFoldDirection || null,
      endFoldLength: template.endFoldLength || null,
      endFoldGap: template.endFoldGap || null,
      girthStartFoldType: template.girthStartFoldType || null,
      girthEndFoldType: template.girthEndFoldType || null,
      // Flip and orientation states
      flipH: template.flipH || false,
      flipV: template.flipV || false,
      firstSegmentAngle: template.firstSegmentAngle,
      labelOffsets: template.labelOffsets || {},
      createdAt: template.createdAt
    };
  }));

  return results;
};

exports.getDrawingsByOrderNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const drawings = await buildDrawingsForOrder(orderNumber);
    res.json(drawings);
  } catch (err) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getDrawingsByOrderId = async (req, res) => {
  try {
    const { orderId, type = "order" } = req.params;
    if(type === "order"){
      const order = await OrderMaster.findById(orderId).lean();

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      let drawings = [];
      const orderNo = computeOrderFields(order).order_unique_id
      drawings = await buildDrawingsForOrder(orderNo);
      

      // Include customer information in each drawing for pricing context
      const customerId = order.account_ID || order.order_customer_id || order.customerId || order.customer_id;
      const customerName = order.account_Name || order.order_customer_name || order.customerName || order.customer_name;
      
      const drawingsWithCustomer = drawings.map(drawing => ({
        ...drawing,
        customerId: customerId,
        customerName: customerName,
        orderNumber: order.order_unique_id
      }));
      
      // Sort drawings in ascending order by createdAt
      drawingsWithCustomer.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      res.json(drawingsWithCustomer);
    }else{

      // Quotation code
      const order = await QuotationMaster.findById(orderId).lean();

      if (!order) {
        return res.status(404).json({ message: 'Quote not found' });
      }
      const drawings = await buildDrawingsForOrder(order.quote_unique_id);
      
      // Include customer information in each drawing for pricing context
      const customerId = order.account_ID || order.quote_customer_id || order.customerId || order.customer_id;
      const customerName = order.account_Name || order.quote_customer_name || order.customerName || order.customer_name;
      
      const quoteDrawingsWithCustomer = drawings.map(drawing => ({
        ...drawing,
        customerId: customerId,
        customerName: customerName,
        orderNumber: order.quote_unique_id
      }));
      
      // Sort drawings in ascending order by createdAt
      quoteDrawingsWithCustomer.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      res.json(quoteDrawingsWithCustomer);
    }
  } catch (err) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
