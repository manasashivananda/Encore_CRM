const mongoose = require('mongoose');
const sql = require('mssql')
const xlsx = require('xlsx'); // Import the xlsx library
const express = require('express'); // Don't forget to import express
const path = require('path');
const fs = require('fs');
const { logError } = require('../logger');
const config = require('../config/sqlConfig');

const CoreProduct = require('../models/coreproductModel');
const CustomProduct = require('../models/customproductModel');
const CustomProductCustomerPriced = require('../models/customproductCustomerPricedModel');
const ProductColor = require('../models/productcolorModel');
const ProductFold = require('../models/productfoldModel');
const ProductGirth = require('../models/productgirthModel');
const CustomerMaterialPricebook = require('../models/customermaterialpricebookModel');
const MaterialPricebook = require('../models/materialpricebookModel');
const Account = require('../models/accountModel');

let attrs = { options: true, new: true };

exports.addCoreProductData = async (req, res) => {
  try {
    const productData = req.body;

    await sql.connect(config);
    const insert = await sql.query("insert into Materials (Material, Density, Units, Metal, Calibration) values ('" + productData.core_Product_Name + "', " + productData.core_Product_Thickness + ", 0, 1, null)");
    if (!insert || insert.rowsAffected === 0) {
      throw new Error('First SQL operation failed.');
    }
    const insert_thickness = await sql.query("insert into Thicknesses (Thickness, Material) values (" + productData.core_Product_Thickness + ", '" + productData.core_Product_Name + "')");
    if (!insert_thickness || insert_thickness.rowsAffected === 0) {
      throw new Error('Second SQL operation failed.');
    }
    const productCount = await CoreProduct.countDocuments();
    productData.core_Product_Order = productCount + 1;
    await CoreProduct.create(productData);
    res.status(200).send('Data Added Succesfully.');
    res.end();
  } catch (err) {
    logError('addCoreProductData', err, req.user.user_ref_id);
    res.status(500).send('Data Adding Failed.');
  }
}

exports.fetchCoreProductData = async (req, res) => {
  try {
     
      const limit = 20;
      const page = req.query.page || 0;
      const skip = page * limit;
      const searchKeyword = req.query.query;
      
      const searchFilter = {};
      if (searchKeyword) {
          searchFilter.$or = [
              { core_Product_Name: { $regex: searchKeyword, $options: "i" } },
              { core_Product_Ref_Id: { $regex: searchKeyword, $options: "i" } },
              { core_Product_Thickness: { $regex: searchKeyword, $options: "i" } },
              { core_Product_Status: { $regex: searchKeyword, $options: "i" } },
          ];
      }

      const total_materials = await CoreProduct.find({
          ...searchFilter,
      });
      let total_materials_count = total_materials.length;
      let materialDetails = await CoreProduct.aggregate([
          {
              $match: {
                  ...searchFilter,
              },
          },
          { $sort: { core_Product_Order: 1 } },
          {
              $project: {
                  _id: 1,
                  core_Product_Name: 1,
                  core_Product_Thickness: 1,
                  core_Product_Ref_Id: 1,
                  core_Product_Status: 1,
                  created: 1,
              }
          }
      ]).skip(skip) .limit(limit);
      const pages = Math.ceil(total_materials_count / limit);
      const fullObj = {
          totalItems: total_materials_count,
          fetchedItems: materialDetails,
          rowsPerPage: limit,
          totalPages: pages,
      };
      res.status(200).send(fullObj);
  }
  catch (err) { 
    logError('fetchCoreProductData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.fetchSpecificCoreProductData = async (req, res) => {
  try {
    let product_Id = req.params.id;
    let productDetails = await CoreProduct.find({ _id: product_Id });
    res.send(productDetails).status(200).end();
  }
  catch (err) { 
    logError('fetchSpecificCoreProductData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.updatespecificCoreProductData = async (req, res) => {
  try {
    let product_Id = req.params.id;

    let productDetails = await CoreProduct.find({ _id: product_Id });
    let productName = productDetails[0].core_Product_Name;

    const product_Data = req.body;
    product_Data.updated = new Date().toISOString();
    let productInfo = await CoreProduct.findByIdAndUpdate(product_Id, product_Data, attrs);

    if (productInfo) {
      try {
        await sql.connect(config);

        // Disable foreign key constraints
        await sql.query("EXEC sp_msforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL'");
        const select = await sql.query("SELECT * FROM Materials WHERE Material = '" + productName + "'");
       
        await sql.query(
          "UPDATE Materials SET Material = '" +
          product_Data.core_Product_Name +
          "', Density = '" +
          product_Data.core_Product_Thickness +
          "' WHERE Material = '" +
          productName +
          "'"
        );
      
        await sql.query(
          "UPDATE Thicknesses SET Material = '" +
          product_Data.core_Product_Name +
          "', Thickness = '" +
          product_Data.core_Product_Thickness +
          "' WHERE Material = '" +
          productName +
          "'"
        );
       
        await sql.query(
          "UPDATE Colours set Material= '" +
          product_Data.core_Product_Name +
          "' where Material = '" + productName + "'");

        // Enable foreign key constraints
        await sql.query("EXEC sp_msforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL'");
      } catch (error) {
        console.error(error);
      } finally {
        sql.close();
      }
    }
    res.status(200).send('Data Updated Succesfully.');
    res.end();
  }
  catch (err) { 
    logError('updatespecificCoreProductData', err, req.user.user_ref_id); 
    res.status(500).send('Data Updation Failed.');
  }
}

const mssql = require('mssql');
exports.addProductColorData = async (req, res) => {
  try {
    const coreProductId = req.params.id;
    const productDetails = await CoreProduct.findById(coreProductId);
    const productName = productDetails.core_Product_Name;

    const checkColor = await ProductColor.find({ product_Color: req.body.product_Color, product_Color_Code: req.body.product_Color_Code });
    if (checkColor.length > 0) {
      res.status(500).send('Color with Code Already Exists!');
    } else {
      await sql.connect(config);

      const {
        product_Color: productColor,
        product_Color_Special_Price: productColorSpecialPrice,
        product_Color_Status: productColorStatus,
        product_Color_Code: productColorCode,
        product_Color_Hex_Code : productColorHexCode
      } = req.body;

      const insertQuery = `INSERT INTO Colours (Colour, Material, IRGB_Colour, AbbrevColour, AlternativeColours)
            VALUES ('${productColor}', '${productName}', null, null, null)`;
      const insert = await mssql.query(insertQuery);

      if (!insert) {
        throw new Error('SQL query failed to execute');
      }

      const productColorObj = new ProductColor({
        product_Core_Id: coreProductId,
        product_Color: productColor,
        product_Color_Special_Price: productColorSpecialPrice,
        product_Color_Status: productColorStatus,
        product_Color_Code: productColorCode,
        product_Color_Hex_Code: productColorHexCode
      });

      await productColorObj.save();
      res.status(200).send("Data Added Succesfully");
    }
  } catch (err) {
    console.log(err);
    logError('addProductColorData', err, req.user.user_ref_id);
    res.status(500).send('Data Adding Failed.');
  }
};

exports.fetchProductColorData = async (req, res) => {
  try {
    const Core_Product_Id = req.params.id;
    let productColors = await ProductColor.find({ product_Core_Id: Core_Product_Id }).sort({ product_Color : 1});
    res.send(productColors).status(200).end();
  }
  catch (err) { 
    logError('fetchProductColorData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.fetchSpecificProductColorData = async (req, res) => {
  try {
    let product_Id = req.params.id;
    let productColor = await ProductColor.find({ _id: product_Id });
    res.send(productColor).status(200).end();
  }
  catch (err) { 
    logError('fetchSpecificProductColorData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.updateSpecificProductColorData = async (req, res) => {
  try {
    let product_Id = new mongoose.Types.ObjectId(req.params.id);
    let productColDet = await ProductColor.aggregate([
      { $match: { $and: [{ _id: product_Id }] } },
      { $lookup: { from: "coreproducts", as: "proddetails", localField: "product_Core_Id", foreignField: "_id" } },
      { $unwind: { path: "$proddetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          product_Color: 1,
          product_Material_Id: "$proddetails._id",
          product_Material: "$proddetails.core_Product_Name",
        }
      }
    ]);

    let colorName = productColDet[0].product_Color;
    let materialId = productColDet[0].product_Material_Id;
    let materialName = productColDet[0].product_Material;

    let productMaterial = await CoreProduct.find({ _id: materialId });
    let productName = productMaterial[0].core_Product_Name;

    const product_Color = req.body;
    product_Color.updated = new Date().toISOString();
    let productColorInfo = await ProductColor.findByIdAndUpdate(product_Id, product_Color, attrs);

    if (productColorInfo) {
      await sql.connect(config);
      // Update Operations
      await sql.query("select * from Colours where Colour = '" + colorName + "' AND Material = '" + materialName + "'");
      await sql.query("update Colours set Colour = '" + product_Color.product_Color + "', Material= '" + productName + "' where Colour = '" + colorName + "' AND Material = '" + materialName + "'");
    }
    res.status(200).send('Data Updated Succesfully.');
    res.end();
  }
  catch (err) { 
    logError('updateSpecificProductColorData', err, req.user.user_ref_id); 
    res.status(500).send('Data Updation Failed.');
  }
}

//Product Folds Section
exports.addProductFoldData = async (req, res) => {
  try {
    const productFolds = req.body;
    await ProductFold.create(productFolds);
    res.status(200).send('Data Added Succesfully.');
    res.end();
  }
  catch (err) { 
    logError('addProductFoldData', err, req.user.user_ref_id); 
    res.status(500).send('Data Adding Failed.');
  }
}

exports.fetchProductFoldData = async (req, res) => {
  try {
    let productFolds = await ProductFold.find().sort({ product_Fold_Order : 1});
    res.send(productFolds).status(200).end();
  }
  catch (err) { 
    logError('fetchProductFoldData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.fetchSpecificProductFoldData = async (req, res) => {
  try {
    let product_Id = req.params.id;
    let productfold = await ProductFold.find({ _id: product_Id });
    res.send(productfold).status(200).end();
  }
  catch (err) { 
    logError('fetchSpecificProductFoldData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.updateSpecificProductFoldData = async (req, res) => {
  try {
    let product_Id = req.params.id;
    const product_Fold = req.body;
    product_Fold.updated = new Date().toISOString();
    await ProductFold.findByIdAndUpdate(product_Id, product_Fold, attrs);
    res.status(200).send('Data Updated Succesfully.');
    res.end();
  }
  catch (err) { 
    logError('updateSpecificProductFoldData', err, req.user.user_ref_id); 
    res.status(500).send('Data Updation Failed.');
  }
}

//Product Girth Section
exports.addProductGirthData = async (req, res) => {
  try {
    const productGirths = req.body;
    await ProductGirth.create(productGirths);
    res.status(200).send('Data Added Succesfully.');
    res.end();
  }
  catch (err) { 
    logError('addProductGirthData', err, req.user.user_ref_id); 
    res.status(500).send('Data Adding Failed.');
  }
}

exports.fetchProductGirthData = async (req, res) => {
  try {
    let productGirths = await ProductGirth.find().sort({ product_Girth : 1});
    res.send(productGirths).status(200).end();
  }
  catch (err) { 
    logError('fetchProductGirthData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.fetchSpecificProductGirthData = async (req, res) => {
  try {
    let product_Id = req.params.id;
    let productgirth = await ProductGirth.find({ _id: product_Id });
    res.send(productgirth).status(200).end();
  }
  catch (err) { 
    logError('fetchSpecificProductGirthData', err, req.user.user_ref_id); 
    res.status(500).send('Data Fetching Failed.');
  }
}

exports.updateSpecificProductGirthData = async (req, res) => {
  try {
    let product_Id = req.params.id;
    const product_Girth = req.body;
    product_Girth.updated = new Date().toISOString();
    await ProductGirth.findByIdAndUpdate(product_Id, product_Girth, attrs);
    res.status(200).send('Data Updated Succesfully.');
    res.end();
  }
  catch (err) { 
    logError('updateSpecificProductGirthData', err, req.user.user_ref_id); 
    res.status(500).send('Data Updation Failed.');
  }
}

exports.fetchCustomerSpecificMaterialPricebook = async (req, res) => {
  try {
    const customerId = req.params.cusid;
    const [materials, foldsData, girthsData, priceData] = await Promise.all([
      CoreProduct.find({ core_Product_Status: "active" }).sort({ core_Product_Order: 1 }).lean(),
      ProductFold.find().sort({ product_Fold_Order: 1 }).lean(),
      ProductGirth.find().sort({ product_Girth: 1 }).lean(),
      CustomerMaterialPricebook.find({ customer_ID: customerId })
        .populate('girth_ID')
        .populate('fold_ID')
        .lean()
    ]);

    const headers = [{ value: 'Girth/Fold' }, ...foldsData.map(fd => ({ value: fd.product_Fold }))];
    const priceMap = new Map();
    for (const price of priceData) {
      const key = `${price.material_ID}_${price.girth_ID._id}_${price.fold_ID._id}`;
      priceMap.set(key, price.price_Values);
    }

    const materialarray = materials.map((material) => {
      const materialObj = {
        id: material._id,
        name: material.core_Product_Name,
        code: material.core_Product_Ref_Id,
        pricedetails: {
          headers,
          rowvalues: girthsData.map(girthData => {
            const row = [{ value: girthData.product_Girth }];
            for (const foldData of foldsData) {
              const key = `${material._id}_${girthData._id}_${foldData._id}`;
              row.push({
                value: priceMap.get(key) || '-',
                girthId: girthData._id,
                foldId: foldData._id
              });
            }
            return row;
          })
        }
      };
      return materialObj;
    });
    res.status(200).send(materialarray);
  } catch (err) {
    logError('fetchCustomerSpecificMaterialPricebook', err, req.user?.user_ref_id);
    res.status(500).send('Data Fetching Failed.');
  }
};

// exports.fetchCustomerSpecificMaterialSpecificPricebook = async (req, res) => {
//   try {
//     let customerId = req.params.cusid;
//     let materialId = req.params.mateid;
//     let pricematrixObj = await getMaterialPriceDetails(customerId, materialId);
//     res.send(pricematrixObj).status(200).end();
//   }
//   catch (err) { 
//     logError('fetchCustomerSpecificMaterialSpecificPricebook', err, req.user.user_ref_id); 
//     res.status(500).send('Data Fetching Failed.');
//   }
// }

// New High Speed Optimized Code aftre Discussion with abhijith
exports.fetchCustomerSpecificMaterialSpecificPricebook = async (req, res) => {
  try {
    const customerId = req.params.cusid;
    const materialId = req.params.mateid;

    const [foldsData, girthsData, priceData] = await Promise.all([
      ProductFold.find().sort({ product_Fold_Order: 1 }).lean(),
      ProductGirth.find().sort({ product_Girth: 1 }).lean(),
      CustomerMaterialPricebook.find({
        customer_ID: customerId,
        material_ID: materialId,
      })
        .populate('girth_ID')
        .populate('fold_ID')
        .lean()
    ]);

    const headers = [{ value: 'Girth/Fold' }, ...foldsData.map(f => ({ value: f.product_Fold }))];
    const priceMap = new Map();
    for (const entry of priceData) {
      const key = `${entry.girth_ID._id}_${entry.fold_ID._id}`;
      priceMap.set(key, entry.price_Values);
    }

    const rowvalues = girthsData.map(girth => {
      const row = [{ value: girth.product_Girth }];

      for (const fold of foldsData) {
        const key = `${girth._id}_${fold._id}`;
        const value = priceMap.get(key) || '-';
        row.push({
          value,
          girthId: girth._id,
          foldId: fold._id
        });
      }
      return row;
    });

    res.status(200).send({
      headers,
      rowvalues
    });
  } catch (err) {
    logError('fetchCustomerSpecificMaterialSpecificPricebook', err, req.user?.user_ref_id);
    res.status(500).send('Data Fetching Failed.');
  }
};


exports.addCustomerSpecificMaterialPricebook = async (req, res) => {
  try {
    const customerId = req.params.cusid;
    const materialId = req.params.mateid;
    const priceDetails = req.body;
    const updatePromises = Object.entries(priceDetails).map(async ([key, price]) => {
      const [girth_ID, fold_ID] = key.split('-').map((str) => str.trim());
      const priceData = await CustomerMaterialPricebook.findOneAndUpdate(
        { customer_ID: customerId, material_ID: materialId, girth_ID, fold_ID },
        { $set: { price_Values: price } },
        { upsert: true }
      );
      return priceData;
    });
    await Promise.all(updatePromises);
    res.status(200).send('Data Added/Updated');
  } catch (err) {
    logError('addCustomerSpecificMaterialPricebook', err, req.user.user_ref_id);
    res.status(500).send('Data Adding Failed.');
  }
};

exports.addCustomProductData = async (req, res) => {
  try {
    const cusProdData = req.body;
    const cusProdDataInfo = await CustomProduct.create(cusProdData);
    const customerInfo = await Account.find({ account_Custom_Item_Price_Assignment: true });
    let customerInfoLength = customerInfo.length;
    if (cusProdDataInfo) {
      for (i = 0; i < customerInfoLength; i++) {
        const customerPrice = new CustomProductCustomerPriced({
          custom_Product_Customer_id: customerInfo[i]._id,
          custom_Product_Code: req.body.custom_Product_Code,
          custom_Product_Description: req.body.custom_Product_Description,
          custom_Product_Class: req.body.custom_Product_Class,
          custom_Product_Price: req.body.custom_Product_Price,
        });
        await customerPrice.save();
      }
    }
    res.status(200).send(cusProdDataInfo);
  } catch (err) {
    logError('addCustomProductData', err, req.user.user_ref_id);
    res.status(500).send("Data Adding Failed.");
  }
};

exports.fetchCustomProductData = async (req, res) => {
  try {
    const searchFilter = {};
    const limiter = 30;
    const paginationValue = parseInt(req.query.page) || 0;
    const skipValue = paginationValue * limiter;
    const searchKeyword = req.query.query;
    const fetchAll = req.query.all === "true"; // Check if ?all=true is passed

    if (searchKeyword) {
      searchFilter.$or = [
        { custom_Product_Code: { $regex: searchKeyword, $options: "i" } },
        { custom_Product_Description: { $regex: searchKeyword, $options: "i" } },
      ];
    }

    const baseProjection = {
      custom_Product_Code: 1,
      custom_Product_Description: 1,
      custom_Product_Class: 1,
      custom_Product_UOM: 1,
      is_Flashing: 1,
      custom_Product_Price: 1
    };

    const aggregatePipeline = [
      { $match: searchFilter },
      {
        $facet: {
          totalItems: [{ $count: "count" }],
          fetchedItems: fetchAll
            ? [
                { $sort: { custom_Product_Code: 1 } },
                { $project: baseProjection }
              ]
            : [
                { $sort: { custom_Product_Code: 1 } },
                { $skip: skipValue },
                { $limit: limiter },
                { $project: baseProjection }
              ]
        }
      }
    ];

    const result = await CustomProduct.aggregate(aggregatePipeline);
    const cusProdObj = {
      totalItems: result[0].totalItems[0] ? result[0].totalItems[0].count : 0,
      fetchedItems: result[0].fetchedItems,
      rowsPerPage: fetchAll ? result[0].totalItems[0]?.count || 0 : limiter,
      totalPages: fetchAll ? 1 : result[0].totalItems[0] ? Math.ceil(result[0].totalItems[0].count / limiter) : 0
    };
    res.status(200).send(cusProdObj).end();
  } catch (err) {
    logError('fetchCustomProductData', err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchCustomProductDataCustomerPriced = async (req, res) => {
  try {
    let customerID = new mongoose.Types.ObjectId(req.params.id);
    let searchFilter = {};
    let limiter = 30;
    let pagination_value = req.query.page;
    let searchKeyword = req.query.query || ""; // Ensure searchKeyword is always a string
    let skip_value = pagination_value * limiter;
    let fetchAll = req.query.all === "true"; // Check if ?all=true is passed

    searchFilter = {
      $or: [
        { custom_Product_Code: { $regex: searchKeyword.toString(), $options: "i" } },
        { custom_Product_Description: { $regex: searchKeyword.toString(), $options: "i" } },
        { custom_Product_Class: { $regex: searchKeyword.toString(), $options: "i" } },
      ],
    };

    const cusProdCount = await CustomProductCustomerPriced.countDocuments({
      custom_Product_Customer_id: customerID,
      ...searchFilter,
    });

    const query = CustomProductCustomerPriced.find({
      custom_Product_Customer_id: customerID,
      ...searchFilter,
    }).sort({ custom_Product_Code: 1 }); // <-- Sort added here

    if (!fetchAll) {
      query.skip(skip_value).limit(limiter);
    }

    const cusProdDetails = await query.exec();
    let pages = fetchAll ? 1 : Math.ceil(cusProdCount / limiter);
    const response = {
      totalItems: cusProdCount,
      fetchedItems: cusProdDetails,
      rowsPerPage: fetchAll ? cusProdCount : limiter,
      totalPages: pages,
    };
    res.status(200).send(response);
  } catch (err) {
    logError('fetchCustomProductDataCustomerPriced', err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchCustomProductDataOnEntry = async (req, res) => {
  try {
    const keyword = req.query.query;
    const cusID = new mongoose.Types.ObjectId(req.params.cusid);
    const projection = { custom_Product_Code: 1, custom_Product_UOM: 1, custom_Product_Price: 1, custom_Product_Description: 1 };
    
    const matchCondition = { custom_Product_Customer_id: cusID };
    if (keyword) {
      matchCondition.custom_Product_Code = { $regex: `.*${keyword}.*`, $options: 'i' }; // case-insensitive regex search
    }
    let cusProdDetails = await CustomProductCustomerPriced.find(matchCondition).select(projection).lean();
    if (cusProdDetails.length === 0) {
      const productMatchCondition = {};
      if (keyword) {
        productMatchCondition.custom_Product_Code = { $regex: `.*${keyword}.*`, $options: 'i' }; // case-insensitive regex search
      }
      cusProdDetails = await CustomProduct.find(productMatchCondition).select(projection).lean();
    }
    res.status(200).send(cusProdDetails);
  } catch (err) {
    logError('fetchCustomProductDataOnEntry', err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed.");
  }
};

exports.fetchSpecificCustomProductData = async (req, res) => {
  try {
    let cusProd_Id = req.params.id;
    let productDetails = await CustomProduct.find({ _id: cusProd_Id });
    res.send(productDetails).status(200).end();
  }
  catch (err) { 
    logError('fetchSpecificCustomProductData', err, req.user.user_ref_id); 
    res.status(500).send("Data Fetching Failed.");
  }
}

exports.fetchSpecificCustomProductDataCustomerBased = async (req, res) => {
  try {
    let cusProd_Id = new mongoose.Types.ObjectId(req.params.id);
    let productDetails = await CustomProductCustomerPriced.find({
      _id: cusProd_Id,
    });
    res.send(productDetails).status(200).end();
  }
  catch (err) { 
    logError('fetchSpecificCustomProductDataCustomerBased', err, req.user.user_ref_id); 
    res.status(500).send("Data Fetching Failed.");
  }
}

exports.updatespecificCustomProductData = async (req, res) => {
  try {
    const cusProd_Id = req.params.id;
    const product_Data = req.body;
    product_Data.updated = new Date().toISOString();
    const productInfo = await CustomProduct.findByIdAndUpdate(cusProd_Id, product_Data, { new: true });
    if (productInfo) {
      const updateData = {
        $set: {
          custom_Product_Description: product_Data.custom_Product_Description,
          custom_Product_Class: product_Data.custom_Product_Class,
          custom_Product_UOM: product_Data.custom_Product_UOM,
        }
      };
      const conditions = { custom_Product_Code: productInfo.custom_Product_Code };
      await CustomProductCustomerPriced.updateMany(conditions, updateData);
    }
    res.status(200).send(productInfo);
  } catch (err) {
    logError('updatespecificCustomProductData', err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed.");
  }
};

exports.updatespecificCustomProductDataCustomerBased = async (req, res) => {
  try {
    let cusProd_Id = req.params.id;
    const product_Data = req.body;
    product_Data.updated = new Date().toISOString();
    let productInfo = await CustomProductCustomerPriced.findByIdAndUpdate(cusProd_Id, product_Data, attrs);
    res.status(200).send(productInfo);
    res.end();
  }
  catch (err) { 
    logError('updatespecificCustomProductDataCustomerBased', err, req.user.user_ref_id); 
    res.status(500).send("Data Updation Failed.");
  }
}

// exports.fetchMaterialPricebook = async (req, res) => {
//   try {
//     const materialId = req.params.mateid;
//     const materials = await CoreProduct.find({ _id: materialId });
//     const materialarray = await Promise.all(
//       materials.map(async (material) => {
//         const materialObj = {
//           id: material._id,
//           name: material.core_Product_Name,
//         };
//         const pricematrixObj = await getMaterialSpecificPriceDetails(materialObj.id);
//         materialObj.pricedetails = pricematrixObj;

//         return materialObj;
//       })
//     );
//     res.status(200).json(materialarray);
//   } catch (err) {
//     logError('fetchMaterialPricebook', err, req.user.user_ref_id);
//     res.status(500).send('Data Fetching Failed.');
//   }
// };

// New High Speed Optimized Code aftre Discussion with abhijith
exports.fetchMaterialPricebook = async (req, res) => {
  try {
    const materialId = req.params.mateid;

    const [material, foldsData, girthsData, priceData] = await Promise.all([
      CoreProduct.findById(materialId).lean(),
      ProductFold.find().sort({ product_Fold_Order: 1 }).lean(),
      ProductGirth.find().sort({ product_Girth: 1 }).lean(),
      MaterialPricebook.find({ material_ID: materialId }).lean()
    ]);

    if (!material) {
      return res.status(404).send('Material not found.');
    }

    const headers = [{ value: 'Girth/Fold' }, ...foldsData.map(f => ({ value: f.product_Fold }))];
    const priceMap = new Map();
    for (const price of priceData) {
      const key = `${price.girth_ID}_${price.fold_ID}`;
      priceMap.set(key, price.price_Values);
    }

    const rowvalues = girthsData.map(girth => {
      const row = [{ value: girth.product_Girth }];
      foldsData.forEach(fold => {
        const key = `${girth._id}_${fold._id}`;
        row.push({
          value: priceMap.get(key) || '0',
          girthId: girth._id,
          foldId: fold._id
        });
      });
      return row;
    });

    const materialarray = [{
      id: material._id,
      name: material.core_Product_Name,
      pricedetails: {
        headers,
        rowvalues
      }
    }];
    res.status(200).json(materialarray);
  } catch (err) {
    logError('fetchMaterialPricebook', err, req.user?.user_ref_id);
    res.status(500).send('Data Fetching Failed.');
  }
};


exports.addSpecificMaterialPricebook = async (req, res) => {
  try {
    const materialId = req.params.mateid;
    const priceDetails = req.body;
    const updatePromises = Object.entries(priceDetails).map(async ([key, price]) => {
    const [girth_ID, fold_ID] = key.split('-').map((str) => str.trim());
    const priceData = await MaterialPricebook.findOneAndUpdate(
      { material_ID: materialId, girth_ID, fold_ID },
      { $set: { price_Values: price } },
      { upsert: true }
    );
      return priceData;
    });
    await Promise.all(updatePromises);
    res.status(200).send('Data Added/Updated');
  } catch (err) {
    logError('addSpecificMaterialPricebook', err, req.user.user_ref_id);
    res.status(500).send('Data Adding Failed.');
  }
};

exports.bulkImportDefaultMaterialPrice = async (req, res) => {
  try {
    let sheets = [];
    if (req.files && req.files.length > 0) {
      sheets = req.files.map((file) => file.filename);
    }
    for (const sheet of sheets) {
      const filePath = path.join(__dirname, '..', 'xlsximages', sheet);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = [];
      const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
      xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
        const rowData = {};
        for (let i = 0; i < 9; i++) {
          rowData[headerRow[i]] = row[i];
        }
        jsonData.push(rowData);
      });
     
      if (jsonData.length > 0) {
        let deleteExisting = await MaterialPricebook.deleteMany();
        try {
          await processAndStoreData(jsonData);
         
          // Delete the file after successful processing
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Failed to delete file:", err);
              res.status(500).send('Failed to delete file');
              return;
            }
            res.status(200).send('Successfully Added Price Matrix');
          });
        } catch (error) {
          console.error("Failed to process:", error);
          res.status(500).send('Internal Server Error');
        }
      }
    }
  } catch (err) {
    logError('bulkImportDefaultMaterialPrice', err, req.user.user_ref_id);
    res.status(500).send("Data Import Failed.");
  }
};

async function processAndStoreData(jsonData) {
  const batchSize = 100;
  const processSingleItem = async (data) => {
    let girth_val = data.Girth;
    let girthData = await ProductGirth.findOne({ product_Girth: girth_val });
    let girthID = girthData._id;
    let fold_val = data.Folds;
    let foldData = await ProductFold.findOne({ product_Fold: fold_val });
    let foldID = foldData._id;
    let material = data.Cat2;
    let materialData = await CoreProduct.findOne({ core_Product_Ref_Id: material });
    let materialID = materialData._id;
    let price = data.Price;

    if (!girth_val || !fold_val || !price) {
      return;
    }

    let checkExistance = await MaterialPricebook.find({
      material_ID: materialID,
      girth_ID: girthID,
      fold_ID: foldID
    });

    if (checkExistance.length > 0) {
      return; 
    }

    const PriceData = new MaterialPricebook({
      material_ID: materialID,
      girth_ID: girthID,
      fold_ID: foldID,
      price_Values: price,
    });
    return await PriceData.save();
  };

  for (let i = 0; i < jsonData.length; i += batchSize) {
    const batch = jsonData.slice(i, i + batchSize);
    const batchPromises = batch.map(data => processSingleItem(data));
    await Promise.all(batchPromises);
  }
  return "All data successfully processed!";
}

exports.bulkImportCustomerBasedMaterialPrice = async (req, res) => {
  try {
    let sheets = [];
    if (req.files && req.files.length > 0) {
      sheets = req.files.map((file) => file.filename);
    }
    for (const sheet of sheets) {
      const filePath = path.join(__dirname, '..', 'xlsximages', sheet);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = [];
      const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
      xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
        const rowData = {};
        for (let i = 0; i < 9; i++) {
          rowData[headerRow[i]] = row[i];
        }
        jsonData.push(rowData);
      });
      let CustomerID = new mongoose.Types.ObjectId(req.params.cusid);

      if (jsonData.length > 0) {
        let deleteExisting = await CustomerMaterialPricebook.deleteMany({ customer_ID: CustomerID });

        // Function Call
        await processAndStoreDataCustomerBased(jsonData, CustomerID)
          .then(response => {
            // Delete the file after successful processing
            fs.unlink(filePath, (err) => {
              if (err) {
                console.error("Failed to delete file:", err);
              } else {
                console.log("File deleted successfully");
              }
            });
            res.status(200).send('Successfully Added Price Matrix');
          })
          .catch(error => {
            console.error("Failed to process:", error);
            res.status(500).send('Internal Server Error');
          });
      }
    }
  } catch (err) {
    logError('bulkImportCustomerBasedMaterialPrice', err, req.user.user_ref_id);
    res.status(500).send("Data Import Failed.");
  }
};

async function processAndStoreDataCustomerBased(jsonData, CustomerID) {
  const batchSize = 100;
  const processSingleItem = async (data) => {
    let girth_val = data.Girth;
    let girthData = await ProductGirth.findOne({ product_Girth: girth_val });
    let girthID = girthData._id;
    let fold_val = data.Folds;
    let foldData = await ProductFold.findOne({ product_Fold: fold_val });
    let foldID = foldData._id;
    let material = data.Cat2;
    let materialData = await CoreProduct.findOne({ core_Product_Ref_Id: material });
    let materialID = materialData._id;
    let price = data.Price;
    let customerid = CustomerID;

    let checkExistance = await CustomerMaterialPricebook.find({
      customer_ID: customerid,
      material_ID: materialID,
      girth_ID: girthID,
      fold_ID: foldID
    });

    if (checkExistance.length > 0) {
      return;
    }
    const CustomerPriceData = new CustomerMaterialPricebook({
      customer_ID: customerid,
      material_ID: materialID,
      girth_ID: girthID,
      fold_ID: foldID,
      price_Values: price,
    });
    return await CustomerPriceData.save();
  };

  for (let i = 0; i < jsonData.length; i += batchSize) {
    const batch = jsonData.slice(i, i + batchSize);
    const batchPromises = batch.map(data => processSingleItem(data));
    await Promise.all(batchPromises);
  }
  return "All data successfully processed!";
}

exports.assignDefaultPricebookToCustomer = async (req, res) => {
  try {
    let CustomerID = new mongoose.Types.ObjectId(req.params.cusid);

    // Deleting existing entries
    await CustomerMaterialPricebook.deleteMany({ customer_ID: CustomerID });
    let defaultPrices = await MaterialPricebook.find();
    if (defaultPrices.length > 0) {
      let savePromises = [];

      for (let i = 0; i < defaultPrices.length; i++) {
        const DefaultPriceData = new CustomerMaterialPricebook({
          customer_ID: CustomerID,
          material_ID: defaultPrices[i].material_ID,
          girth_ID: defaultPrices[i].girth_ID,
          fold_ID: defaultPrices[i].fold_ID,
          price_Values: defaultPrices[i].price_Values,
        });
        savePromises.push(DefaultPriceData.save());
      }

      // Awaiting all the promises at once
      await Promise.all(savePromises);

      // Sending success response
      res.status(200).send('Default Price Assigned To The Customer');
    } else {
      res.status(500).send("No Default Price Assigned!"); 
    }
  } catch (err) {
    logError('assignDefaultPricebookToCustomer', err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed.");
  }
};

// Bulk Upload Master Only
exports.bulkImportCustomItemcodeDefaultPriced = async (req, res) => {
  try {
    let sheets = [];
    if (req.files && req.files.length > 0) {
      sheets = req.files.map((file) => file.filename);
    }
    const totalSheets = sheets.length;
    let sheetsProcessed = 0;

    const promises = sheets.map(async (sheet) => {
      sheetsProcessed++;
      const filePath = path.join(__dirname, '..', 'xlsximagescustom', sheet);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = [];
      const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];

      if (!headerRow || headerRow.length === 0) {
        console.error("Header row is empty or undefined.");
        return Promise.reject('Invalid Excel file format');
      }

      const cleanHeaderRow = headerRow.map((key) => key.replace(/\s+/g, '_'));
      xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
        const rowData = {};
        for (let i = 0; i < cleanHeaderRow.length; i++) {
          rowData[cleanHeaderRow[i]] = row[i];
        }
        jsonData.push(rowData);
      });

      const existingRowsCount = await CustomProduct.countDocuments();
      if (existingRowsCount === 0) {
        const bulkInsertOperations = jsonData.map(async (item) => {
          if (item.Inventory_ID) {
            const customIDPriceData = new CustomProduct({
              custom_Product_Code: item.Inventory_ID,
              custom_Product_Description: item.Description,
              custom_Product_Class: item.ItemClass,
              custom_Product_UOM: item.Base_Unit,
              is_Flashing: item?.Is_Flashing ? (item.Is_Flashing.toLowerCase() === "yes" ? true : false) : false,
              custom_Product_Price: item.Price || 0,
            });
            await customIDPriceData.save();
          } else {
            console.warn("Skipping row without a valid Inventory_ID");
          }
        });

        await Promise.all(bulkInsertOperations);
      } else {
        const bulkOperations = jsonData.map(async (item) => {
          const CusId = item.Inventory_ID;

          if (!CusId) {
            console.warn("Skipping row without a valid Inventory_ID");
            return;
          }
          const CusDesc = item.Description;
          const CusItemClass = item.ItemClass;
          const CusUOM = item.Base_Unit;
          const CusPrice = item.Price || 0;
          const IsFlashing = item.Is_Flashing.toLowerCase() === "yes" ? true : false || false
          const checkIDExistance = await CustomProduct.findOne({ custom_Product_Code: CusId });
          if (checkIDExistance) {
            const updateData = {
              $set: {
                custom_Product_Code: CusId,
                custom_Product_Description: CusDesc,
                custom_Product_Class: CusItemClass,
                custom_Product_UOM: CusUOM,
                is_Flashing: IsFlashing,
                custom_Product_Price: CusPrice,
              },
            };
            const conditions = { _id: checkIDExistance._id };
            await CustomProduct.updateOne(conditions, updateData);
          } else {
            const customIDPriceData = new CustomProduct({
              custom_Product_Code: CusId,
              custom_Product_Description: CusDesc,
              custom_Product_Class: CusItemClass,
              custom_Product_UOM: CusUOM,
              is_Flashing: IsFlashing,
              custom_Product_Price: CusPrice,
            });
            await customIDPriceData.save();
          }
        });
        await Promise.all(bulkOperations);
      }
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Error deleting file ${filePath}:`, err);
        } else {
          console.log(`File ${filePath} deleted successfully`);
        }
      });
    });

    await Promise.all(promises);
    res.status(200).send("Data Imported Successfully");
  } catch (err) {
    logError('bulkImportCustomItemcodeDefaultPriced', err, req.user.user_ref_id);
    res.status(500).send("Data Import Failed.");
  }
};

exports.bulkImportCustomItemcodeCustomerPriced = async (req, res) => {
  try {
    const customerID = new mongoose.Types.ObjectId(req.params.id);
    const existingCustomerPrices = await CustomProductCustomerPriced.find({ custom_Product_Customer_id: customerID });
    let sheets = [];
    if (req.files && req.files.length > 0) {
      sheets = req.files.map((file) => file.filename);
    }

    const totalSheets = sheets.length;
    let sheetsProcessed = 0;

    const promises = sheets.map(async (sheet) => {
      sheetsProcessed++;
      
      const filePath = path.join(__dirname, '..', 'xlsximagescustom', sheet);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = [];
      const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];

      if (!headerRow || headerRow.length === 0) {
        console.error("Header row is empty or undefined.");
        return Promise.reject('Invalid Excel file format');
      }

      const cleanHeaderRow = headerRow.map((key) => key.replace(/\s+/g, '_'));
      xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
        const rowData = {};
        for (let i = 0; i < cleanHeaderRow.length; i++) {
          rowData[cleanHeaderRow[i]] = row[i];
        }
        jsonData.push(rowData);
      });

      const allCustomProducts = await CustomProduct.find({});
      const customProductMap = new Map();
      allCustomProducts.forEach(prod => {
        customProductMap.set(prod.custom_Product_Code, prod);
      });

      const customerPricingMap = new Map();
      existingCustomerPrices.forEach(price => {
        customerPricingMap.set(price.custom_Product_Code, price);
      });

      const bulkOperations = [];
      jsonData.forEach(item => {
        const InvId = item.Inventory_ID;
        const CusPrice = item.Price || 0;

        if (!InvId || !customProductMap.has(InvId)) {
          console.warn(`Skipping row - Invalid or unknown InvId: ${InvId}`);
          return;
        }

        const customProd = customProductMap.get(InvId);
        const existsInPricing = customerPricingMap.has(InvId);
        if (existsInPricing) {
          const filter = {
            custom_Product_Code: InvId,
            custom_Product_Customer_id: customerID
          };
          const update = {
            $set: {
              custom_Product_Price: CusPrice,
              updated: new Date()
            }
          };
          bulkOperations.push({ updateOne: { filter, update } });
        } else {
          const newEntry = {
            custom_Product_Customer_id: customerID,
            custom_Product_Code: InvId,
            custom_Product_Description: customProd.custom_Product_Description,
            custom_Product_Class: customProd.custom_Product_Class,
            custom_Product_UOM: customProd.custom_Product_UOM,
            custom_Product_Price: CusPrice,
            created: new Date()
          };
          bulkOperations.push({ insertOne: { document: newEntry } });
        }
      });

      if (bulkOperations.length > 0) {
        await CustomProductCustomerPriced.bulkWrite(bulkOperations);
      }

      fs.unlinkSync(filePath); // Delete file
    });

    await Promise.all(promises);
    await Account.findByIdAndUpdate(customerID, {
      $set: { account_Custom_Item_Price_Assignment: true }
    });
    res.status(200).send("Data Imported Successfully");
  } catch (err) {
    logError('bulkImportCustomItemcodeCustomerPriced', err, req.user.user_ref_id);
    res.status(500).send("Data Import Failed.");
  }
};

exports.assignDefaultCustomItemPriceToCustomer = async (req, res) => {
  try {
    let CustomerID = new mongoose.Types.ObjectId(req.params.id);
    let deleteExisting = await CustomProductCustomerPriced.deleteMany({ custom_Product_Customer_id: CustomerID }); // Deleting existing entries

    const aggregationPipeline = [
      {
        $addFields: {
          custom_Product_Customer_id: CustomerID
        }
      },
      {
        $project:{
          _id : 0,
          created : 0
        }
      }
    ];

    const pricesWithCustomerID = await CustomProduct.aggregate(aggregationPipeline);
    if (pricesWithCustomerID.length > 0) {
      await CustomProductCustomerPriced.insertMany(pricesWithCustomerID);
      const conditions = { _id: CustomerID };
      const dataToUpdate = { $set: { "account_Custom_Item_Price_Assignment": true } };
      const updatedOrderInfo = await Account.findByIdAndUpdate(conditions, dataToUpdate);
      res.status(200).send('Default Price Assigned To The Customer'); // Sending success response
    } else {
      res.status(400).send('No default prices provided in Master!');
    }
  } catch (err) {
    logError('assignDefaultCustomItemPriceToCustomer', err, req.user.user_ref_id);
    res.status(500).send("Data Assignation Failed.");
  }
};

exports.updateSpecificMaterialPriceBook = async (req, res) => {
  try {
    let sheets = [];
    let materialObjID = new mongoose.Types.ObjectId(req.params.materialid);
    let materialDetails = await CoreProduct.findOne({ _id: materialObjID });
    let materialRefCode = materialDetails.core_Product_Ref_Id;
   
    if (req.files && req.files.length > 0) {
      sheets = req.files.map((file) => file.filename);
    }
    for (const sheet of sheets) {
      const filePath = path.join(__dirname, '..', 'xlsximages', sheet);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = [];
      const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
      xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
        const rowData = {};
        for (let i = 0; i < 9; i++) {
          rowData[headerRow[i]] = row[i];
        }
        jsonData.push(rowData);
      });

      if (jsonData.length > 0) {
        const found = jsonData.some(row => row["Cat2"] === materialRefCode);
        if (!found) {
          res.status(500).send('MaterialRefCode not found in uploaded sheet under Cat2 column');
          return;
        }
        await MaterialPricebook.deleteMany({ material_ID: materialObjID });
        try {
          await processAndStoreDataSingle(jsonData, materialObjID);
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Failed to delete file:", err);
              res.status(500).send('Failed to delete file');
              return;
            }
            res.status(200).send('Successfully Added Price Matrix');
          });
        } catch (error) {
          console.error("Failed to process:", error);
          res.status(500).send('Internal Server Error');
        }
      }
    }
  } catch (err) {
    logError('updateSpecificMaterialPriceBook', err, req.user.user_ref_id);
    res.status(500).send("Data Updation Failed");
  }
};

async function processAndStoreDataSingle(jsonData, materialObjID) {
  const batchSize = 100;
  const processSingleItem = async (data, index) => {
    let girth_val = data.Girth;
    let fold_val = data.Folds;
    let price = data.Price;
    let cat2 = data.Cat2;
    let materialData = await CoreProduct.findOne({ core_Product_Ref_Id: cat2 });
    let catID = materialData._id;

    if (!girth_val || !fold_val || !price) {
      return;
    }
    let girthData = await ProductGirth.findOne({ product_Girth: girth_val });
    if (!girthData) {
      return;
    }
    let girthID = girthData._id;
    let foldData = await ProductFold.findOne({ product_Fold: fold_val });
    if (!foldData) {
      return;
    }
    let foldID = foldData._id;
    let materialID = materialObjID;
    if (materialID.equals(catID)) {
      const priceData = new MaterialPricebook({
        material_ID: materialID,
        girth_ID: girthID,
        fold_ID: foldID,
        price_Values: price,
      });
      return await priceData.save();
    } else {
      console.log("Wrong Material ID uploaded");
    }
  };

  for (let i = 0; i < jsonData.length; i += batchSize) {
    const batch = jsonData.slice(i, i + batchSize);
    const batchPromises = batch.map((data, idx) => processSingleItem(data, i + idx));
    await Promise.all(batchPromises);
  }
  return "All data successfully processed!";
}

exports.updateSpecificMaterialPriceBookForCustomer = async (req, res) => {
  try {
    let sheets = [];
    let CustomerObjID = new mongoose.Types.ObjectId(req.params.cusid);
    let materialObjID = new mongoose.Types.ObjectId(req.params.materialid);
    let materialDetails = await CoreProduct.findOne({ _id: materialObjID });
    let materialRefCode = materialDetails.core_Product_Ref_Id;
    if (req.files && req.files.length > 0) {
      sheets = req.files.map((file) => file.filename);
    }
    for (const sheet of sheets) {
      const filePath = path.join(__dirname, '..', 'xlsximages', sheet);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = [];
      const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
      xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 1 }).forEach((row) => {
        const rowData = {};
        for (let i = 0; i < 9; i++) {
          rowData[headerRow[i]] = row[i];
        }
        jsonData.push(rowData);
      });
     
      if (jsonData.length > 0) {
        const found = jsonData.some(row => row["Cat2"] === materialRefCode);
        if (!found) {
          res.status(500).send('MaterialRefCode not found in uploaded sheet under Cat2 column');
          return;
        }
        await CustomerMaterialPricebook.deleteMany({ customer_ID: CustomerObjID, material_ID: materialObjID });
        await processAndStoreDataCustomerBasedSingle(jsonData, materialObjID, CustomerObjID)
          .then(response => {
            fs.unlink(filePath, (err) => {
              if (err) {
                console.error("Failed to delete file:", err);
              } else {
                console.log("File deleted successfully");
              }
            });
            res.status(200).send('Successfully Added Price Matrix');
          })
          .catch(error => {
            console.error("Failed to process:", error);
            res.status(500).send('Internal Server Error');
          });
      }
    }
  } catch (err) {
      logError('updateSpecificMaterialPriceBookForCustomer', err, req.user.user_ref_id);
      res.status(500).send("Data Updation Failed.");
  }
};

async function processAndStoreDataCustomerBasedSingle(jsonData, materialObjID, CustomerObjID) {
  const batchSize = 100;

  const processSingleItem = async (data) => {
    if (!data.Girth || !data.Folds || !data.Price) {
      return Promise.resolve(); // Gracefully skip this row
    }

    try {
      let girth_val = data.Girth;
      let girthData = await ProductGirth.findOne({ product_Girth: girth_val });
      if (!girthData) {
        console.warn(`Girth not found: ${girth_val}`);
        return;
      }
      let girthID = girthData._id;
      let fold_val = data.Folds;
      let foldData = await ProductFold.findOne({ product_Fold: fold_val });
      if (!foldData) {
        console.warn(`Fold not found: ${fold_val}`);
        return;
      }
      let foldID = foldData._id;
      let price = data.Price;
      let customerid = CustomerObjID;

      let cat2 = data.Cat2;
      let materialData = await CoreProduct.findOne({ core_Product_Ref_Id: cat2 });
      let catID = materialData._id;
      let materialID = materialObjID;

      if (materialID.equals(catID)) {
        const CustomerPriceData = new CustomerMaterialPricebook({
          customer_ID: customerid,
          material_ID: materialObjID,
          girth_ID: girthID,
          fold_ID: foldID,
          price_Values: price,
        });
        return await CustomerPriceData.save();
      }else{
        console.log("Wrong Material ID uploaded");
      }
    } catch (error) {
      console.error(`Error processing item: ${JSON.stringify(data)} - ${error.message}`);
    }
  };

  for (let i = 0; i < jsonData.length; i += batchSize) {
    const batch = jsonData.slice(i, i + batchSize);
    const batchPromises = batch.map(data => processSingleItem(data));
    await Promise.all(batchPromises);
  }
  return "All data successfully processed!";
}

exports.updateSpecificMaterialPercentage = async (req, res) => {
  try {
      let materialObjID = new mongoose.Types.ObjectId(req.params.materialid);
      let Percentage = parseFloat(req.body.percentage);

      if (isNaN(Percentage)) {
        return res.status(400).json({ error: 'Invalid input' });
      }

      let materialPrices = await MaterialPricebook.find({ material_ID: materialObjID });
      for (let row of materialPrices) {
        if (row.price_Values) {
          let originalPrice = parseFloat(row.price_Values);
          if (!isNaN(originalPrice)) {
            let updatedPrice = originalPrice + (originalPrice * Percentage / 100);
            row.price_Values = updatedPrice.toFixed(2);
            await row.save();
          }
        }
      }

      res.status(200).send(`Percentage Applied`);
  } catch (err) {
      logError('updateSpecificMaterialPercentage', err, req.user.user_ref_id);
      res.status(500).send("Data Updation Failed");
  }
};

exports.updateSpecificMaterialPercentageForCustomer = async (req, res) => {
  try {
      let CustomerObjID = new mongoose.Types.ObjectId(req.body.customerId);
      let materialObjID = new mongoose.Types.ObjectId(req.params.materialid);
      let Percentage = parseFloat(req.body.percentage);

      if (!CustomerObjID || isNaN(Percentage)) {
        return res.status(400).json({ error: 'Invalid input' });
      }

      let customerPrices = await CustomerMaterialPricebook.find({ customer_ID: CustomerObjID,  material_ID: materialObjID });
      for (let row of customerPrices) {
        if (row.price_Values) {
          let originalPrice = parseFloat(row.price_Values);
          if (!isNaN(originalPrice)) {
            let updatedPrice = originalPrice + (originalPrice * Percentage / 100);
            row.price_Values = updatedPrice.toFixed(2);
            await row.save();
          }
        }
      }

      res.status(200).send(`Percentage Applied`);
  } catch (err) {
      logError('updateSpecificMaterialPercentageForCustomer', err, req.user.user_ref_id);
      res.status(500).send("Data Updation Failed");
  }
};

exports.deleteCustomItemCodeBulk = async (req, res) => {
  try {
    const deleteMasterCustomCodes = await CustomProduct.deleteMany();
    if (deleteMasterCustomCodes.deletedCount > 0) {
      const deleteCustomerCustomCodes = await CustomProductCustomerPriced.deleteMany();
      if (deleteCustomerCustomCodes.deletedCount > 0) {
        return res.status(200).send("All deleted from Master and Customer");
      } else {
        return res.status(200).send("Master deleted. No Customer codes found to delete.");
      }
    } else {
      return res.status(500).send("No Master Custom Codes found to delete.");
    }
  } catch (err) {
    logError('deleteCustomItemCodeBulk', err, req.user.user_ref_id);
    return res.status(500).send("Data Deletion Failed.");
  }
};

exports.deleteCustomItemCodeSingle = async (req, res) => {
  try {
    const inventoryCode = req.params.code;
    const deleteMasterResult = await CustomProduct.deleteMany({ custom_Product_Code: inventoryCode });
    if (deleteMasterResult.deletedCount > 0) {
      const deleteCustomerResult = await CustomProductCustomerPriced.deleteMany({ custom_Product_Code: inventoryCode });
      if (deleteCustomerResult.deletedCount > 0) {
        return res.status(200).send("Codes deleted from Master and Customer");
      } else {
        return res.status(200).send("Master deleted. No Customer code found to delete.");
      }
    } else {
      return res.status(500).send("No Master Custom Codes found to delete.");
    }
  } catch (err) {
    logError('deleteCustomItemCodeSingle', err, req.user.user_ref_id);
    return res.status(500).send("Data Deletion Failed.");
  }
};

exports.fetchMasterCustomItemCodesUpdateCustomerCodeList = async (req, res) => {
  try {
    const CustomerID = new mongoose.Types.ObjectId(req.params.cusid);
    const allCustomProducts = await CustomProduct.find();
    if (!allCustomProducts.length) return res.status(404).send("No Custom Items Found In Master!");

    const existingPricedProducts = await CustomProductCustomerPriced.find({
      custom_Product_Customer_id: CustomerID
    }).lean();

    const existingMap = new Map();
    for (const entry of existingPricedProducts) {
      existingMap.set(entry.custom_Product_Code, entry);
    }

    const bulkOps = [];
    for (const product of allCustomProducts) {
      const existingEntry = existingMap.get(product.custom_Product_Code);

      if (existingEntry) {
        bulkOps.push({
          updateOne: {
            filter: {
              custom_Product_Customer_id: CustomerID,
              custom_Product_Code: product.custom_Product_Code
            },
            update: {
              $set: {
                custom_Product_Description: product.custom_Product_Description,
                custom_Product_Class: product.custom_Product_Class,
                custom_Product_UOM: product.custom_Product_UOM,
                updated: new Date()
              }
            }
          }
        });
      } else {
        // Prepare insert operation
        bulkOps.push({
          insertOne: {
            document: {
              custom_Product_Customer_id: CustomerID,
              custom_Product_Code: product.custom_Product_Code,
              custom_Product_Description: product.custom_Product_Description,
              custom_Product_Class: product.custom_Product_Class,
              custom_Product_UOM: product.custom_Product_UOM,
              custom_Product_Price: product.custom_Product_Price,
              created: new Date()
            }
          }
        });
      }
    }
    if (bulkOps.length > 0) {
      await CustomProductCustomerPriced.bulkWrite(bulkOps);
    }
    res.status(200).json({ message: 'Customer product list updated successfully using bulkWrite.' });
  } catch (err) {
    logError('fetchMasterCustomItemCodesUpdateCustomerCodeList', err, req.user.user_ref_id);
    res.status(500).send("Data Fetching Failed");
  }
};



