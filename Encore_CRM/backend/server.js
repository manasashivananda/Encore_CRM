require('dotenv').config();
const { checkEnvVariables, requiredEnvVars } = require('./middleware/envValidator');
try {
  checkEnvVariables(requiredEnvVars);
  console.log('All environment variables are set.');
} catch (error) {
  console.error('Environment variable validation failed:', error.message);
  process.exit(1); // Exit the application if validation fails
}


const express = require('express');
const app = express();
const config = require('./config');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3-v3'); // instead of multer-s3
const { v4: uuidv4 } = require('uuid');
const http = require('http');
// const { init } = require('./socket');
const server = http.createServer(app);
const jobsEventsHandler = require('./events/jobsEvents');

// const io = init(server);
//Define all imported packages
app.use(cors({
  origin: '*', // or '*' in dev
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('./static',express.static(path.join(__dirname,'public')));
app.use(express.raw());
app.use(express.urlencoded({ extended: true }));

// // ADD THIS - Serve service-worker.js with correct MIME type BEFORE static middleware
// app.get('/service-worker.js', (req, res) => {
//   const swPath = path.join(__dirname, 'build', 'service-worker.js');
//   if (fs.existsSync(swPath)) {
//     res.setHeader('Content-Type', 'application/javascript');
//     res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
//     res.sendFile(swPath);
//   } else {
//     res.status(404).send('Service worker not found');
//   }
// });


// app.use(express.static("build", {
//   maxAge: "1y",
//   etag: true,
//   lastModified: true,
//   setHeaders: (res, path) => {
//     if (path.endsWith("index.html")) {
//       // Prevent caching of index.html
//       res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
//       res.setHeader("Pragma", "no-cache");
//       res.setHeader("Expires", "0");
//     } else if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
//       // Cache static assets for 1 year (safe because of content hashing)
//       res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
//     }
//   }
// }));


app.get('/events', jobsEventsHandler);

server.listen(config.port, ()=>{ console.log(`Port listening from ${config.port} `);});

// io.on('connection', socket => {
//   socket.on('join', room => socket.join(room));
// });

// io.engine.on('connection_error', err => {
//   console.error('Socket engine error:', err);
// });

const auth = require("./middleware/auth");

// NEW – meta route (part groups & classes) - MUST come before general templates route
const metaRoutes = require('./routes/meta');
app.use('/api/templates/meta', metaRoutes);

const templateRoutes = require('./routes/templateRoutes');
app.use('/api/templates', templateRoutes);

const templateLibraryRoutes = require('./routes/templateLibraryRoutes');
app.use('/api/template-library', templateLibraryRoutes);

// AWF Product Library — separate catalog for AWF products (downpipes, clips, offsets, rollforming)
const awfProductLibraryRoutes = require('./routes/awfProductLibraryRoutes');
app.use('/api/awf-products', awfProductLibraryRoutes);

const priceRoutes = require('./routes/priceRoutes');
app.use('/api/custom-prices', priceRoutes)


// Upload directory no longer needed - using base64 storage
// Removed static file serving for /uploads
app.use('/api/swi', require('./routes/swiRoutes'));

const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

const tagRoutes = require('./routes/tagRoutes');
app.use('/api/tags', tagRoutes);

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadDirCustom = path.join(__dirname, 'xlsximagescustom');
if (!fs.existsSync(uploadDirCustom)) {
  fs.mkdirSync(uploadDirCustom, { recursive: true });
}

const uploadDirFlashing = path.join(__dirname, 'xlsximages');
if (!fs.existsSync(uploadDirFlashing)) {
  fs.mkdirSync(uploadDirFlashing, { recursive: true });
}

const uploadDirLogs = path.join(__dirname, 'logs');
if (!fs.existsSync(uploadDirLogs)) {
  fs.mkdirSync(uploadDirLogs, { recursive: true });
}

const uploadDirDockets = path.join(__dirname, 'dockets');
if (!fs.existsSync(uploadDirDockets)) {
  fs.mkdirSync(uploadDirDockets, { recursive: true });
}

const uploadDirBarcodeImages = path.join(__dirname, 'barcodeimages');
if (!fs.existsSync(uploadDirBarcodeImages)) {
  fs.mkdirSync(uploadDirBarcodeImages, { recursive: true });
}

const uploadDirBarcodeImagesPdf = path.join(__dirname, 'barcodeimagespdf');
if (!fs.existsSync(uploadDirBarcodeImagesPdf)) {
  fs.mkdirSync(uploadDirBarcodeImagesPdf, { recursive: true });
}

const uploadDirDesignImages = path.join(__dirname, 'designimages');
if (!fs.existsSync(uploadDirDesignImages)) {
  fs.mkdirSync(uploadDirDesignImages, { recursive: true });
}

const storage = multerS3({
  s3: s3Client,
  bucket: 'encore-sheet',
  key: function (req, file, cb) {
    const originalname = file.originalname;
    const monthNames = [
      "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
    ];
    const now = new Date();
    const currentMonth = monthNames[new Date().getMonth()];
    const currentYear = now.getFullYear(); // Get the current year
    const filename = `${currentMonth}-${currentYear}/${uuidv4()}-${originalname.replace(/\s+/g, '')}`;
    cb(null, filename);
  },
});

const storageBarcode = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'barcodeimages'); 
  },
  filename: function (req, file, cb) {
    const originalname = file.originalname;
    const extension = originalname.split('.').pop();
    const filename = Date.now() + '-' + originalname.replace(/\s+/g, '');
    cb(null, filename); // Use the modified filename
  },
});

const storagexlsx = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'xlsximages');
  },
  filename: function (req, file, cb) {
    const originalname = file.originalname;
    const extension = originalname.split('.').pop();
    const filename = Date.now() + '-' + originalname.replace(/\s+/g, '');
    cb(null, filename);
  },
});

const storagexlsxcustom = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'xlsximagescustom');
  },
  filename: function (req, file, cb) {
    const originalname = file.originalname;
    const extension = originalname.split('.').pop();
    const filename = Date.now() + '-' + originalname.replace(/\s+/g, '');
    cb(null, filename);
  },
});

const storageDoubt = multerS3({
  s3: s3Client,
  bucket: 'encore-sheet',
  key: function (req, file, cb) {
    const originalname = file.originalname;
    const monthNames = [
      "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
    ];
    const now = new Date();
    const currentMonth = monthNames[new Date().getMonth()];
    const currentYear = now.getFullYear();
    const filename = `${currentMonth}-${currentYear}/${uuidv4()}-${originalname.replace(/\s+/g, '')}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // limit to 10MB
});
const uploadBarcode = multer({ storage: storageBarcode });
const uploadxlsx = multer({ storage: storagexlsx });
const uploadxlsxcustom = multer({ storage: storagexlsxcustom });
const uploadDoubt = multer({ storage: storageDoubt });

//Controller Inclusion
const userCtrl = require('./controllers/userCtrl');
const accountCtrl = require('./controllers/accountCtrl');
const productCtrl = require('./controllers/productCtrl');
const orderMgmtCtrl = require('./controllers/ordermanagementCtrl');
const queryCtrl = require('./controllers/queryCtrl');
const DashboardCtrl = require('./controllers/dashboardCtrl');
const departmentCtrl = require('./controllers/departmentCtrl');

// Edited by Bhaskar c start
const otpAuthCtrl = require('./controllers/otpAuthCtrl')
const barcodeGeneratorCtrl = require('./controllers/generateBarcodeCtrl')
const driverCtrl = require('./controllers/driverCtrl');
const truckCtrl = require('./controllers/truckCtrl');
const runsDriversCtrl = require('./controllers/runsDriversCtrl');
const runsDriverOrdersCtrl = require('./controllers/runsDriversOrderCtrl');
const messagesCtrl = require('./controllers/messagesCtrl');
const deliveryPlanningMgmtCtrl = require('./controllers/deliveryPlanningCtrl');
const configCtrl = require('./controllers/configCtrl');
const splitOrderCtrl = require('./controllers/splitOrdersCtrl');
// Edited by Bhaskar c end

// SWI Ctrl
const fetchMachineDataDropdown = require('./controllers/swiMachineOffcutsReportCtrl.js');
const fetchSWIMachineOffcutsReport = require('./controllers/swiMachineOffcutsReportCtrl.js');
const fetchSWIMachineDetailedReport = require('./controllers/swiMachineOffcutsReportCtrl.js');
const fetchMachineMaterialColourDropdown = require('./controllers/swiMachineOffcutsReportCtrl.js');
const fetchFoldingMachinesDropdown  = require('./controllers/swiMachineOffcutsReportCtrl.js');
const fetchSWIMachineFoldReport = require('./controllers/swiMachineOffcutsReportCtrl.js');

// Map Ctrl
const mapCtrl = require('./controllers/mapCtrl.js');

// SWI Machine Offcuts Report Ctrl
const autoEmailReportCtrl = require('./controllers/autoEmailReportCtrl');

//API Inclusion
app.use('/designimages', express.static('designimages'));
app.use('/barcodeimages', express.static('barcodeimages'));
app.use('/xlsximages', express.static('xlsximages'));
app.use('/dockets', express.static('dockets'));
app.use('/logs', express.static('logs'));

// Initialize daily report scheduler
autoEmailReportCtrl.scheduleDailyReports();

//Login API CRUD
app.post('/user-login', userCtrl.userLogin);
app.post('/user-change-password', auth.checkRole('Common', 'add'), userCtrl.userChangePassword);
app.post('/forgot-password', userCtrl.userForgotPassword);
app.post('/update-forgot-password', userCtrl.userUpdateForgotPassword);
app.get('/fetch-specific-profile/:id', auth.checkRole('Common', 'view'), userCtrl.fetchSpecificProfile);

//User API CRUD
app.post('/add-user-data', auth.checkRole('UserManagement', 'add'), userCtrl.addUserData);
app.get('/fetch-user-data', auth.checkRole('UserManagement', 'view'), userCtrl.fetchUserData);
app.get('/fetch-specific-user-data/:id', auth.checkRole('UserManagement', 'view'), userCtrl.fetchspecificuserdata);
app.patch('/update-specific-user-data/:id', auth.checkRole('UserManagement', 'edit'), userCtrl.updatespecificuserdata);
app.get('/users/export', auth.checkRole('UserManagement', 'view'), userCtrl.exportUserData);

//Roles API CRUD
app.post('/add-role-data', auth.checkRole('RolesManagement', 'add'), userCtrl.addRoleData);
app.get('/fetch-role-data', auth.checkRole('RolesManagement', 'view'), userCtrl.fetchRoleData);
app.get('/fetch-role-data-dropdown', auth.checkRole('RolesManagement', 'view'), userCtrl.fetchRoleDataDropdown);
app.get('/fetch-specific-role-data/:id', auth.checkRole('RolesManagement', 'view'), userCtrl.fetchspecificroledata);
app.patch('/update-role-data/:id', auth.checkRole('RolesManagement', 'edit'), userCtrl.updateroledata);

// User Roles Permissions API CRUD
app.post('/add-role-permissions-data/:id', auth.checkRole('RolesManagement', 'add'), userCtrl.addRolePermissionData);
app.get('/fetch-role-permission-data/:id', auth.checkRole('RolesManagement', 'view'), userCtrl.fetchRolePermissionData);
app.patch('/update-role-permissions/:id', auth.checkRole('RolesManagement', 'edit'), userCtrl.updateRolePermissionData);

//Modules API CRUD
app.post('/add-modules-data', auth.checkRole('ModuleManagement', 'add'), userCtrl.addModulesData);
app.get('/fetch-modules-data', auth.checkRole('ModuleManagement', 'view'), userCtrl.fetchModulesData);
app.get('/fetch-specific-modules-data/:id', auth.checkRole('ModuleManagement', 'view'), userCtrl.fetchspecificmodulesdata);
app.patch('/update-specific-modules-data/:id', auth.checkRole('ModuleManagement', 'edit'), userCtrl.updatespecificmodulesdata);

//Accounts API CRUD
app.post('/add-account-data', auth.checkRole('Customer', 'add'), accountCtrl.addAccountData);
app.get('/fetch-account-data', auth.checkRole('Customer', 'view'), accountCtrl.fetchAccountData);
app.get('/fetch-account-data-dropdown', auth.checkRole('Customer', 'view'), accountCtrl.fetchAccountDataDropdown);
app.get('/fetch-specific-account-data/:id', auth.checkRole('Customer', 'view'), accountCtrl.fetchspecificaccountdata);
app.patch('/update-specific-account-data/:id', auth.checkRole('Customer', 'edit'), accountCtrl.updatespecificaccountdata);

//Accounts Contact API CRUD
app.post('/add-account-contact-data/:id', auth.checkRole('Customer', 'add'), accountCtrl.addAccountContactData);
app.get('/fetch-account-contact-data/:id/:mode', auth.checkRole('Customer', 'view'), accountCtrl.fetchAccountContactData);
app.get('/fetch-specific-account-contact-data/:id', auth.checkRole('Customer', 'view'), accountCtrl.fetchspecificaccountcontactdata);
app.patch('/update-specific-account-contact-data/:id/:mode', auth.checkRole('Customer', 'edit'), accountCtrl.updatespecificaccountcontactdata);
app.delete('/delete-account-site-contact/:id', auth.checkRole('Customer', 'view'), accountCtrl.deleteAccountSiteContact);

//Accounts Address API CRUD
app.get('/fetch-account-address-data/:id', auth.checkRole('Customer', 'view'), accountCtrl.fetchAccountAddressData);
app.get('/fetch-specific-account-address-data/:id', auth.checkRole('Customer', 'view'), accountCtrl.fetchSpecificAccountAddressData);
app.patch('/update-specific-account-address-data/:id/', auth.checkRole('Customer', 'edit'), accountCtrl.updateSpecificAccountAddressData);
app.delete('/delete-account-site-address/:id', auth.checkRole('Customer', 'view'), accountCtrl.deleteAccountSiteAddress);

// Core Product API CRUD
app.post('/add-core-product-data', auth.checkRole('Product', 'add'), productCtrl.addCoreProductData);
app.get('/fetch-core-product-data', auth.checkRole('Product', 'view'), productCtrl.fetchCoreProductData);
app.get('/fetch-specific-core-product-data/:id', auth.checkRole('Product', 'view'), productCtrl.fetchSpecificCoreProductData);
app.patch('/update-specific-core-product-data/:id', auth.checkRole('Product', 'edit'), productCtrl.updatespecificCoreProductData);

// Custom Product API CRUD
app.post('/add-custom-product-data', auth.checkRole('Common', 'add'), productCtrl.addCustomProductData);
app.get('/fetch-custom-product-data', auth.checkRole('CustomItemMaster', 'view'), productCtrl.fetchCustomProductData);
app.get('/fetch-custom-product-data-on-entry/:cusid', auth.checkRole('Common', 'view'), productCtrl.fetchCustomProductDataOnEntry);
app.get('/fetch-specific-custom-product-data/:id', auth.checkRole('Common', 'view'), productCtrl.fetchSpecificCustomProductData);
app.get('/fetch-specific-custom-product-data-customer-based/:id', auth.checkRole('Common', 'view'), productCtrl.fetchSpecificCustomProductDataCustomerBased);
app.patch('/update-specific-custom-product-data/:id', auth.checkRole('Common', 'edit'), productCtrl.updatespecificCustomProductData);
app.patch('/update-specific-custom-product-data-customer-based/:id', auth.checkRole('Common', 'edit'), productCtrl.updatespecificCustomProductDataCustomerBased);

// Product Color API CRUD
app.post('/add-product-color-data/:id', auth.checkRole('Product', 'add'), productCtrl.addProductColorData);
app.get('/fetch-product-color-data/:id', auth.checkRole('Product', 'view'), productCtrl.fetchProductColorData);
app.get('/fetch-specific-product-color-data/:id', auth.checkRole('Product', 'view'), productCtrl.fetchSpecificProductColorData);
app.patch('/update-specific-product-color-data/:id', auth.checkRole('Product', 'edit'), productCtrl.updateSpecificProductColorData);

// Product Folds API CRUD
app.post('/add-product-fold-data', auth.checkRole('Product', 'add'), productCtrl.addProductFoldData);
app.get('/fetch-product-fold-data', auth.checkRole('Product', 'view'), productCtrl.fetchProductFoldData);
app.get('/fetch-specific-product-fold-data/:id', auth.checkRole('Product', 'view'), productCtrl.fetchSpecificProductFoldData);
app.patch('/update-specific-product-fold-data/:id', auth.checkRole('Product', 'edit'), productCtrl.updateSpecificProductFoldData);

// Product Girth API CRUD
app.post('/add-product-girth-data', auth.checkRole('Product', 'add'), productCtrl.addProductGirthData);
app.get('/fetch-product-girth-data', auth.checkRole('Product', 'view'), productCtrl.fetchProductGirthData);
app.get('/fetch-specific-product-girth-data/:id', auth.checkRole('Product', 'view'), productCtrl.fetchSpecificProductGirthData);
app.patch('/update-specific-product-girth-data/:id', auth.checkRole('Product', 'edit'), productCtrl.updateSpecificProductGirthData);

//Price Matrix Operations Customer Specific API CRUD
app.get('/fetch-customer-specific-material-pricebook/:cusid', auth.checkRole('Customer', 'view'), productCtrl.fetchCustomerSpecificMaterialPricebook);
app.get('/fetch-customer-specific-material-specific-pricebook/:cusid/:mateid', auth.checkRole('Customer', 'view'), productCtrl.fetchCustomerSpecificMaterialSpecificPricebook);
app.post('/add-customer-specific-material-pricebook/:cusid/:mateid', auth.checkRole('Customer', 'add'), productCtrl.addCustomerSpecificMaterialPricebook);

//Price Matrix Operations Material Specific API CRUD
app.get('/fetch-material-priceBook/:mateid', auth.checkRole('Common', 'view'), productCtrl.fetchMaterialPricebook);
app.post('/add-specific-material-pricebook/:mateid', auth.checkRole('Common', 'add'), productCtrl.addSpecificMaterialPricebook);

//Order Master Operations API CRUD
app.post('/add-order-details', auth.checkRole('OrderManagement', 'add'),  upload.array('documents'), orderMgmtCtrl.addOrderDetails);
app.get('/fetch-order-details', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchOrderDetails);
app.get('/fetch-specific-order-details/:orderid', auth.checkAnyRole(['OrderManagement', 'DesignerModule', 'Production'], 'view'), orderMgmtCtrl.fetchSpecificOrderDetails);
app.get('/fetch-customer-based-order-details/:cusid', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchCustomerBasedOrderDetails);
app.patch('/update-specific-order-details/:orderid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), upload.array('documents'), orderMgmtCtrl.updateSpecificOrderDetails);
app.put('/update-specific-order-design-images/:orderid/:dept', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), upload.array('documents'), orderMgmtCtrl.updateSpecificOrderDesignImages);
app.get('/fetch-specific-order-design-images/:orderid/:dept', auth.checkAnyRole(['OrderManagement', 'DesignerModule', 'Production'], 'view'), orderMgmtCtrl.fetchSpecificOrderDesignImages);
app.delete('/delete-specific-order-design-images/:orderid/:dept/:indexid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), upload.array('documents'), orderMgmtCtrl.deleteSpecificOrderDesignImages);
app.get('/order-invoice-details/:orderid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.orderInvoiceDetails);
app.get('/fetch-order-full-user-tracking/:orderid', auth.checkAnyRole(['OrderManagement', 'DesignerModule', 'Production'], 'view'), orderMgmtCtrl.fetchOrderFullUserTracking);
app.patch('/update-order-departmental-instruction/:orderid', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.updateOrderDepartmentalInstruction);
app.patch('/update-order-department-rack-details', auth.checkRole('Common', 'view'), orderMgmtCtrl.updateOrderDepartmentRackDetails);
app.patch('/update-order-department-rack-details-custom', auth.checkRole('Production', 'view'), orderMgmtCtrl.updateOrderDepartmentRackDetailsCustom);
app.get('/fetch-order-racking-details', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchOrderRackingDetails);
app.get('/fetch-racking-data-production-dashboard', auth.checkRole('Production', 'view'), orderMgmtCtrl.fetchRackingDataProductionDashboard);
//hold and unhold order
app.patch('/hold-unhold-order/:orderid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.holdOrder);

//Order Processing Operations API CRUD
app.get('/fetch-specific-order-for-processing', auth.checkAnyRole(['OrderManagement', 'Production'], 'view'), orderMgmtCtrl.fetchSpecificOrderForProcessing);
app.get('/fetch-order-processing-info', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchOrderProcessingInfo);
app.get('/fetch-custom-order-processing-info', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchCustomOrderProcessingInfo);

//Order Item Operations API CRUD
app.post('/add-order-item-details/:orderid', auth.checkRole('OrderManagement', 'add'), orderMgmtCtrl.addOrderItemDetails);
app.get('/fetch-specific-order-items/:orderid', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchSpecificOrderItems);
app.get('/fetch-specific-order-item-details/:orderitmid', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchSpecificOrderItemDetails);
app.patch('/update-specific-order-item-details/:orderid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.updateSpecificOrderItemDetails);
app.get('/fetch-item-price/:itemcode/:cusid', auth.checkRole('Common', 'view'),  orderMgmtCtrl.fetchItemPrice);
app.post('/get-girthandfold-from-designtool/:orderid/:cusid', auth.checkRole('Common', 'add'), orderMgmtCtrl.getGirthFoldFromDesignTool);
app.post('/fetch-ordersubitems-from-designtool/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.fetchOrderSubItemsFromDesignTool);
// app.post('/fetch-ordersubitems-from-designtool-manually/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.fetchOrderSubItemsFromDesignToolManually);
app.post('/add-manual-entry-order-item/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.addManualEntryOrderItem);
app.get('/fetch-manual-entry-order-item/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.fetchManualEntryOrderItem);
app.get('/fetch-specific-manual-entry-order-item/:orderid/:cusid', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchSpecificManualEntryOrderItem);
app.patch('/update-manual-entry-order-item/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.updateManualEntryOrderItem);
app.get('/delete-specific-manual-entry-order-item/:orderid/:deptcode', auth.checkRole('Common', 'view'), orderMgmtCtrl.deleteSpecificManualEntryOrderItem);

//Department API
app.post('/add-department-data', auth.checkRole('Common', 'add'), departmentCtrl.addDepartmentData);
app.get('/fetch-department-data', auth.checkRole('Common', 'view'), departmentCtrl.fetchDepartmentData);
app.get('/fetch-specific-department-data/:id', auth.checkRole('Common', 'view'), departmentCtrl.fetchSpecificDepartmentData);
app.patch('/update-specific-department-data/:id', auth.checkRole('Common', 'edit'), departmentCtrl.updateSpecificDepartmentData);

//Racking API
app.post('/add-racking-data',  auth.checkRole('Common', 'add'), departmentCtrl.addRackingData);
app.get('/fetch-racking-data', auth.checkRole('Common', 'view'),  departmentCtrl.fetchRackingData);
app.get('/fetch-racking-data-dropdown', auth.checkRole('Common', 'view'), departmentCtrl.fetchRackingDataDropdown);
app.get('/fetch-specific-racking-data/:id', auth.checkRole('Common', 'view'),  departmentCtrl.fetchSpecificRackingData);
app.patch('/update-specific-racking-data/:id', auth.checkRole('Common', 'edit'),  departmentCtrl.updateSpecificRackingData);

//Dashboard API
app.get('/dashboard-info-details',  auth.checkRole('Common', 'view'), DashboardCtrl.dashboardInfoDetails);
app.get('/dashboard-monthly-order-details',  auth.checkRole('Common', 'view'), DashboardCtrl.dashboardMonthlyOrderDetails);
app.get('/dashboard-yearly-order-details',  auth.checkRole('Common', 'view'), DashboardCtrl.dashboardYearlyOrderDetails);

//Order Designer Dashboard Operations
app.get('/designer-dashboard-order-list', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.designerDashboardOrderList);
app.patch('/assign-order-to-designer/:orderid/:userid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignOrderToDesigner);
app.get('/specific-designer-order-list', auth.checkRole('DesignerModule', 'view'), orderMgmtCtrl.specificDesignerOrderList);
app.patch('/assign-order-to-qc/:orderid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignOrderToQC);
app.patch('/assign-order-back-to-designer/:orderid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignOrderBackToDesigner);

//Order QC Dashboard Operations
app.get('/qc-dashboard-order-list', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.qcDashboardOrderList);
app.patch('/assign-order-to-qced/:orderid/:userid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignOrderToQCED);
app.get('/specific-qc-order-list', auth.checkRole('DesignerModule', 'view'), orderMgmtCtrl.specificQCOrderList);
app.post('/qc-failed-order-list-mark', auth.checkRole('DesignerModule', 'add'), orderMgmtCtrl.qcFailedOrderListMark);
app.get('/qc-failed-shapeid-list/:orderid', auth.checkRole('DesignerModule', 'view'), orderMgmtCtrl.qcFailedShapeiList);
app.patch('/assign-order-to-production/:orderid/:dept', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignOrderToProduction);

//Order Production Dashboard Operations
app.get('/production-dashboard-order-list', auth.checkAnyRole(['OrderManagement', 'Production'], 'view'), orderMgmtCtrl.productionDashboardOrderList);
app.get('/fetch-specific-order-barcode/:orderid', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignerModule'], 'view'), orderMgmtCtrl.fetchSpecificOrderBarcode);
app.post('/sent-barcode-designs-for-printing/:orderid/:dept', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignerModule'], 'add'),  uploadBarcode.array('documents'), orderMgmtCtrl.sentBarcodeDesignsForPrinting);
app.post('/sent-barcode-designs-for-printing-manual/:orderid/:dept', orderMgmtCtrl.sentBarcodeDesignsForPrintingManual);
app.post('/assign-to-start-production/:orderid', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignerModule'], 'add'), orderMgmtCtrl.assignToStartProduction);
app.get('/specific-production-order-list', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignerModule'], 'view'), orderMgmtCtrl.specificProductionOrderList);
app.get('/email-sent-defect-list', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.emailSentDefectList);

//Order Reports Generating Operations
app.get('/fetch-user-data-report', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchUserDataReport);
app.get('/design-reports-generate', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignReport'], 'view'), orderMgmtCtrl.designReportsGenerate);
app.get('/design-reports-generate-export', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignReport'], 'view'), orderMgmtCtrl.designReportsGenerateExport);
app.get('/qc-reports-generate', auth.checkAnyRole(['OrderManagement', 'Production', 'QCReport'], 'view'), orderMgmtCtrl.qcReportsGenerate);
app.get('/qc-reports-generate-export', auth.checkAnyRole(['OrderManagement', 'Production', 'QCReport'], 'view'), orderMgmtCtrl.qcReportsGenerateExport);
app.get('/production-reports-generate', auth.checkAnyRole(['OrderManagement', 'Production', 'DesignerModule'], 'view'), orderMgmtCtrl.productionReportsGenerate);

//Loading Dashboard
app.get('/loading-dashboard-order-list', auth.checkAnyRole(['LoadingReport'], 'view'), orderMgmtCtrl.loadingDashboardOrderList);
app.get('/loading-dashboard-order-list-export', auth.checkAnyRole(['LoadingReport'], 'view'), orderMgmtCtrl.loadingDashboardOrderListExport);

//Employee Report Dashboard
app.get('/employee-production-dashboard-report', auth.checkAnyRole(['ProductionReport'], 'view'), orderMgmtCtrl.employeeProductionDashboardReport);
app.get('/employee-production-dashboard-info', auth.checkAnyRole(['ProductionReport'], 'view'), orderMgmtCtrl.employeeProductionDashboardInfo);
app.get('/employee-production-dashboard-info-summary', auth.checkAnyRole(['ProductionReport'], 'view'), orderMgmtCtrl.employeeProductionDashboardInfoSummary);

//Customer Report Dashboard
app.get('/customer-dashboard-report', auth.checkAnyRole(['CustomerReport'], 'view'), orderMgmtCtrl.customerDashboardReport);
app.get('/customer-dashboard-report-export', auth.checkAnyRole(['CustomerReport'], 'view'), orderMgmtCtrl.customerDashboardReportExport);

//Order Report Dashboard
app.get('/order-dashboard-report', auth.checkAnyRole(['OrderReport'], 'view'), orderMgmtCtrl.orderrDashboardReport);
app.get('/order-dashboard-report-excel-export', auth.checkAnyRole(['OrderReport'], 'view'), orderMgmtCtrl.orderrDashboardReportExcelExport);

//MYOB Operations
//Sent SaleOrder Line Items to MYOB
app.post('/sent-ordermaster-item-details-to-myob/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.sentOrderMasterItemDetailsToMyob);
app.post('/resent-ordermaster-item-details-to-myob/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.reSentOrderMasterItemDetailsToMyob);

//Fetch Customer From MYOB Using OrderID
app.get('/fetch-customer-from-myob-using-orderid/:orderid', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchCustomerFromMyobUsingOrderid);
 
//Myob API For Postman Hit
app.post('/myob-login', orderMgmtCtrl.myobLogin);
app.post('/myob-logout', orderMgmtCtrl.myobLogout);

//Bulk Import Codes
//Flashing Products
app.post('/bulk-import-default-material-price', auth.checkRole('Common', 'add'), uploadxlsx.array('documents'), productCtrl.bulkImportDefaultMaterialPrice);
app.post('/bulk-import-customer-based-material-price/:cusid', auth.checkRole('Common', 'add'), uploadxlsx.array('documents'), productCtrl.bulkImportCustomerBasedMaterialPrice);
app.post('/assign-default-pricebook-to-customer/:cusid', auth.checkRole('Common', 'add'), productCtrl.assignDefaultPricebookToCustomer);

//Custom Products
app.post('/bulk-import-custom-itemcode-default-priced', auth.checkRole('Common', 'add'), uploadxlsxcustom.array('documents'), productCtrl.bulkImportCustomItemcodeDefaultPriced);
app.post('/bulk-import-custom-itemcode-customer-priced/:id', auth.checkRole('Common', 'add'), uploadxlsxcustom.array('documents'), productCtrl.bulkImportCustomItemcodeCustomerPriced);
app.post('/assign-default-customitem-price-to-customer/:id', auth.checkRole('Common', 'add'), productCtrl.assignDefaultCustomItemPriceToCustomer);
app.get('/fetch-custom-product-data-customer-priced/:id', auth.checkRole('Common', 'view'), productCtrl.fetchCustomProductDataCustomerPriced);

//Fetch Customer List With Details From MYOB
app.get('/fetch-customer-list-with-details-from-myob', auth.checkRole('Common', 'view'), accountCtrl.fetchCustomerListWithDetailsFromMyob);

//Quotation Module
//Quotation Master API Crud
app.get('/fetch-customer-from-myob-using-quotesid/:quotesid', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchCustomerFromMyobUsingQuotationid);
app.post('/add-quotation-details', auth.checkRole('OrderManagement', 'add'), upload.array('documents'), orderMgmtCtrl.addQuotationDetails);
app.get('/fetch-quotation-details', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchQuotationDetails);
app.get('/fetch-specific-quotation-details/:quotesid',auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.fetchSpecificQuotationDetails);
app.get('/fetch-specific-quotation-details-page/:quotesid', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchSpecificQuotationDetailsPage);
app.patch('/update-specific-quotation-details/:quotesid', auth.checkRole('OrderManagement', 'edit'), upload.array('documents'), orderMgmtCtrl.updateSpecificQuotationDetails);

//Quotation Custom Items API Crud
app.post('/add-manual-entry-quotation-item/:quotesid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.addManualEntryQuotationItem);
app.get('/fetch-manual-entry-quotation-item/:quotesid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.fetchManualEntryQuotationItem);
app.get('/fetch-specific-manual-entry-quotation-item/:quotesid/:cusid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.fetchSpecificManualEntryQuotationItem);
app.patch('/update-manual-entry-quotation-item/:quotesid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.updateManualEntryQuotationItem);
app.get('/delete-specific-manual-entry-quotation-item/:quotesid/:deptcode', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.deleteSpecificManualEntryQuotationItem);
app.get('/fetch-quotation-flashings-from-designtool/:quotesid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.fetchQuotationFlashingsFromDesigntool);
// app.post('/fetch-quotation-flashings-from-designtool-manually/:quotesid',  auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchQuotationFlashingsFromDesigntoolManually);
app.get('/fetch-quotation-item-to-order', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchQuotationItemToOrder);
app.get('/fetch-quote-full-user-tracking/:quoteid', auth.checkAnyRole(['OrderManagement', 'DesignerModule', 'Production'], 'view'), orderMgmtCtrl.fetchQuoteFullUserTracking);

// Quotation Designer Dashboard Operations
app.get('/designer-dashboard-quotation-list', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.designerDashboardQuotationList);
app.patch('/assign-quotation-to-designer/:quotesid/:userid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignQuotationToDesigner);
app.get('/specific-designer-quotation-list', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.specificDesignerQuotationList);
app.patch('/assign-quotation-to-qc/:quotesid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'edit'), orderMgmtCtrl.assignQuotationToQC);

//Quotation QC Dashboard Operations
app.get('/qc-dashboard-quotation-list', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.qcDashboardQuotationList);
app.patch('/assign-quotation-to-qced/:quotesid/:userid', auth.checkAnyRole(['OrderManagement', 'DesignerModule'], 'view'), orderMgmtCtrl.assignQuotationToQCED);
app.get('/specific-qc-quotation-list', auth.checkRole('DesignerModule', 'view'), orderMgmtCtrl.specificQCQuotationList);
app.post('/qc-failed-quotation-list-mark', auth.checkRole('DesignerModule', 'add'), orderMgmtCtrl.qcFailedQuotationListMark);
app.get('/qc-failed-quotation-shapeid-list/:quotesid', auth.checkRole('DesignerModule', 'view'), orderMgmtCtrl.qcFailedQuotationShapeiList);
app.patch('/assign-quotation-ready-to-myob/:quotesid/:dept', auth.checkRole('Common', 'edit'), orderMgmtCtrl.assignQuotationReadyToMYOB);

// Order Total Update API
app.get('/update-all-ordersmasters', auth.checkRole('Common', 'view'), orderMgmtCtrl.CorrectAllOrderMasterTotals);

// Critical Phase APIs
// Operations Dashboard
app.get('/operations-dashboard-report', auth.checkRole('Common', 'view'), orderMgmtCtrl.operationsDashboardReport);

// Draggable Master
app.get('/fetch-order-lineitems-details/:orderid', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchOrderLineitemsDetails);
app.post('/update-order-dragged-lineitems/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.updateDraggedOrderLineitems);

// Run Report
app.get('/runs-report-list', auth.checkRole('Common', 'view'), orderMgmtCtrl.runsReportList);
app.get('/runs-report-list-export', auth.checkRole('Common', 'view'), orderMgmtCtrl.runsReportListExport);

// Delivery Docket
app.get('/generate-docket-pdf-docketwise', auth.checkRole('Common', 'view'), orderMgmtCtrl.generateDocketPDFDocketwise);

// Sale Order Docket
app.post('/generate-sale-order-docket/:orderid', auth.checkRole('Common', 'view'), orderMgmtCtrl.generateSaleOrderDocket);

// Quotation Module
app.post('/generate-quotation-docket/:quotesid', auth.checkRole('Common', 'view'), orderMgmtCtrl.generateQuotationDocket);
app.post('/convert-quote-to-sale-order/:quoteid', auth.checkRole('Common', 'add'), orderMgmtCtrl.convertQuoteToSaleOrder);
app.put('/upload-quotation-payment-reciept/:quoteid/', auth.checkRole('Common', 'add'), upload.array('documents'), orderMgmtCtrl.uploadQuotationPaymentReciept);
app.delete('/delete-quotation-payment-reciept/:quoteid/:indexid', auth.checkRole('Common', 'edit'), upload.array('documents'), orderMgmtCtrl.deleteQuotationPaymentReciept);
app.get('/fetch-quotation-payment-reciept/:quoteid/', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchQuotationPaymentReciept);
app.patch('/update-specific-quotation-item-details/:quoteid', auth.checkRole('OrderManagement', 'edit'), orderMgmtCtrl.updateSpecificQuotationItemDetails);
app.get('/fetch-specific-quotation-item-details/:quoteitmid', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchSpecificQuotationItemDetails);
app.get('/fetch-quotation-lineitems-details/:quoteid', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchQuotationLineitemsDetails);

// Remake Order
app.post('/remake-sale-order/:orderid', auth.checkRole('Common', 'add'), orderMgmtCtrl.remakeSaleOrder);

// Cancel SaleOrder
app.post('/cancel-sale-order/:orderid/:userid', auth.checkRole('Common', 'add'),  orderMgmtCtrl.cancelSaleOrder);

// City Master
app.post('/add-new-city-data', auth.checkRole('Common', 'view'), accountCtrl.addNewCityData);
app.post('/bulk-import-city', auth.checkRole('Common', 'add'), uploadxlsxcustom.array('documents'), accountCtrl.bulkImportCity);
app.get('/bulk-export-city', auth.checkRole('Common', 'view'), accountCtrl.bulkExportCity);
app.get('/fetch-city-data', auth.checkRole('Common', 'view'), accountCtrl.fetchCityData);
app.get('/fetch-city-data-dropdown', auth.checkRole('Common', 'view'), accountCtrl.fetchCityDataDropdown);
app.get('/fetch-specific-city-data/:id', auth.checkRole('Common', 'view'), accountCtrl.fetchSpecificCityData);
app.patch('/update-specific-city-data/:id', auth.checkRole('Common', 'edit'), accountCtrl.updateSpecificCityData);
app.delete('/delete-specific-city-data/:id', auth.checkRole('Customer', 'edit'), accountCtrl.deleteSpecificCityData);

//Error Logs
app.get('/logs-list', auth.checkRole('Common', 'view'), queryCtrl.logsList);

// Price Matrix Individual Upload & Discount
app.post('/update-specific-material-price-book/:materialid', auth.checkRole('Common', 'add'), uploadxlsx.array('documents'), productCtrl.updateSpecificMaterialPriceBook);
app.post('/update-specific-material-price-book-for-customer/:materialid/:cusid', auth.checkRole('Common', 'add'), uploadxlsx.array('documents'), productCtrl.updateSpecificMaterialPriceBookForCustomer);
app.post('/update-specific-material-percentage/:materialid', auth.checkRole('Common', 'add'), productCtrl.updateSpecificMaterialPercentage);
app.post('/update-specific-material-percentage-for-customer/:materialid', auth.checkRole('Common', 'add'), productCtrl.updateSpecificMaterialPercentageForCustomer);

// Custom Item Code Master
app.delete('/delete-custom-item-code-bulk', auth.checkRole('Common', 'edit'), productCtrl.deleteCustomItemCodeBulk);
app.delete('/delete-custom-item-code-single/:code', auth.checkRole('Common', 'edit'), productCtrl.deleteCustomItemCodeSingle);
app.post('/fetch-master-custom-item-codes-update-customer-code-list/:cusid', auth.checkRole('Common', 'add'), productCtrl.fetchMasterCustomItemCodesUpdateCustomerCodeList);

// Edited by Bhaskar c start

// Driver API CRUD
app.get('/fetch-driver-list', auth.checkRole('RunsManagement', 'view'), driverCtrl.getDriverList);
app.post('/add-driver', auth.checkRole('RunsManagement', 'add'), driverCtrl.createDriver);
app.get('/fetch-specific-driver/:id', auth.checkRole('RunsManagement', 'view'), driverCtrl.getDriverById);
app.patch('/update-driver/:id', auth.checkRole('RunsManagement', 'edit'), driverCtrl.updateDriver);
app.delete('/delete-driver/:id', auth.checkRole('RunsManagement', 'view'), driverCtrl.deleteDriver);
app.get('/fetch-active-drivers', auth.checkRole('RunsManagement', 'view'), driverCtrl.fetchActiveDrivers);

// Truck API CRUD
app.get('/fetch-truck-list', auth.checkRole('RunsManagement', 'view'), truckCtrl.getTruckList);
app.post('/add-truck', auth.checkRole('RunsManagement', 'add'), truckCtrl.createTruck);
app.get('/fetch-specific-truck/:id', auth.checkRole('RunsManagement', 'view'), truckCtrl.getTruckById);
app.patch('/update-truck/:id', auth.checkRole('RunsManagement', 'edit'), truckCtrl.updateTruck);
app.delete('/delete-truck/:id', auth.checkRole('RunsManagement', 'view'), truckCtrl.deleteTruck);
app.get('/fetch-active-trucks', auth.checkRole('RunsManagement', 'view'), truckCtrl.fetchActiveTrucks);

app.post('/log-truck-maintenance', auth.checkRole('RunsManagement', 'add'), truckCtrl.logTruckMaintanance);
app.get('/fetch-truck-log/:id', auth.checkRole('RunsManagement', 'view'), truckCtrl.getTruckLogMaintainanceByTruckId);

// Runs API 
// Add drivers
app.post('/add-runs-drivers', auth.checkRole('RunsManagement', 'add'), runsDriversCtrl.createDriversList);
// app.get('/fetch-runs-drivers', auth.checkRole('RunsManagement', 'view'), runsDriversCtrl.getRunsDrivers);
app.patch('/update-runs-drivers/:id', auth.checkRole('RunsManagement', 'edit'), runsDriversCtrl.updateDriversList);
app.get('/fetch-specific-run/:id', auth.checkRole('RunsManagement', 'view'), runsDriversCtrl.getRunsDriversById);
app.post('/fetch-runs-drivers-export', auth.checkRole('RunsManagement', 'view'), runsDriversCtrl.getRunsDriversForExport);
app.get('/fetch-runs', auth.checkRole('RunsManagement', 'view'), runsDriversCtrl.getRuns);
app.get('/verify-all-orders-assigned', auth.checkRole('RunsManagement', 'view'), runsDriverOrdersCtrl.checkAllOrdersAssignedToDeliveryDate);

// Add orders for drivers
app.post('/add-orders-to-driver', auth.checkRole('RunsManagement', 'add'), runsDriverOrdersCtrl.createDriverOrders);
app.get('/check-orders-assigned', auth.checkRole('RunsManagement', 'view'), runsDriverOrdersCtrl.checkHasAssignedOrdersByDriverId);

app.post('/fetch-runs-order-details', auth.checkRole('RunsManagement', 'view'), runsDriverOrdersCtrl.fetchRunsOrderDetails);
app.post('/export-runs-order-details', auth.checkRole('RunsManagement', 'view'), runsDriverOrdersCtrl.exportToXLSXRunsOrder);

app.get('/fetch-specific-order-barcode-details/:orderid', auth.checkRole('BarcodeGenerator', 'view'), barcodeGeneratorCtrl.fetchSpecificOrderBarcodeDetails);
app.post('/sent-barcode-pdf-for-printing/:orderid/:dept/:send_email',  auth.checkRole('BarcodeGenerator', 'view'), uploadBarcode.array('documents'), barcodeGeneratorCtrl.sentBarcodePDFForPrinting);
app.get('/fetch-suspicious-logins', userCtrl.fetchSuspeciousLogins)
app.patch('/update-suspicious-logins/:id', auth.checkRole('UserManagement', 'view'), userCtrl.updateSuspeciousLogins);

app.get('/fetch-message-co', auth.checkRole('OrderCoordinator', 'view'), messagesCtrl.getMessagesCo);
app.post('/post-message',  auth.checkRole('OrderCoordinator', 'add'), messagesCtrl.postMessage);
app.patch('/update-message/:id', auth.checkRole('OrderCoordinator', 'edit'), messagesCtrl.updateMessage);

// Delivery Planning 
app.get('/get-del-planning', auth.checkRole('DeliveryPlanning', 'view'), deliveryPlanningMgmtCtrl.getDeliveryPlanning);
app.get('/export-del-planning', auth.checkRole('DeliveryPlanning', 'view'), deliveryPlanningMgmtCtrl.exportDeliveryPlanning);
app.patch('/update-order-comment/:id',  auth.checkRole('DeliveryPlanning', 'view'), deliveryPlanningMgmtCtrl.updateOrderStatusCommentDetails);
app.post('/add-ext-order', auth.checkRole('DeliveryPlanning', 'add'), deliveryPlanningMgmtCtrl.addExternalOrderDetails);
app.get('/get-ext-order', auth.checkRole('DeliveryPlanning', 'view'), deliveryPlanningMgmtCtrl.getExternalOrders);
app.delete('/delete-ext-order/:id', auth.checkRole('DeliveryPlanning', 'edit'), deliveryPlanningMgmtCtrl.deleteExtOrder);
app.patch('/update-ext-order/:id', auth.checkRole('DeliveryPlanning', 'edit'), deliveryPlanningMgmtCtrl.updateExternalOrderDetails);
app.post('/bulk-import-ext-orders', auth.checkRole('DeliveryPlanning', 'add'), uploadxlsx.array('documents'), deliveryPlanningMgmtCtrl.bulkImportExternalOrders);
app.patch('/upload-docket-ext-orders/:id', auth.checkRole('DeliveryPlanning', 'add'), upload.array('documents'), deliveryPlanningMgmtCtrl.uploadDocketsForExtOrders);
app.delete('/delete-docket-ext-orders/:id/:index', auth.checkRole('DeliveryPlanning', 'view'), upload.array('documents'), deliveryPlanningMgmtCtrl.deleteDocketsForExtOrders);
app.get('/fetch-specific-ext-order/:id', auth.checkRole('DeliveryPlanning', 'view'), deliveryPlanningMgmtCtrl.fetchSpecificExtOrder);
// split orders 
app.post('/split-order', auth.checkRole('DeliveryPlanning', 'add'), splitOrderCtrl.addSplitOrders);
app.get('/fetch-split-order/:id', auth.checkRole('DeliveryPlanning', 'view'), splitOrderCtrl.fetchSplitOrderDetails);
app.patch('/update-split-order-by-id/:id', auth.checkRole('DeliveryPlanning', 'edit'), splitOrderCtrl.updateSplitOrderDetailsBySplitId);
app.post('/update-split-order-line-item', auth.checkRole('DeliveryPlanning', 'edit'), splitOrderCtrl.updateSplitOrderLineId);


app.post('/verify-auth', otpAuthCtrl.verifyAuth);
app.post('/regenerate-auth', otpAuthCtrl.regenerated2FA);
app.post('/update-order-item-qc-status/:orderid', auth.checkRole('OrderItemQC', 'view'), orderMgmtCtrl.orderItemQCStatus);
app.patch('/upload-awf-docket/:id', auth.checkRole('OrderManagement', 'edit'), upload.array('documents'), orderMgmtCtrl.uploadAWFDockets);
app.get('/fetch-awf-docket/:id', auth.checkRole('OrderManagement', 'view'), orderMgmtCtrl.fetchAWFDocket);
app.delete('/delete-awf-docket/:id/:indexid', auth.checkRole('OrderManagement', 'view'), upload.array('documents'), orderMgmtCtrl.deleteAWFDocket);


// updated routes for Runs Management
app.post('/add/run', auth.checkRole('RunsManagement', 'add'), runsDriverOrdersCtrl.createDraftDriversToRuns);
app.post('/add/single/driver', auth.checkRole('RunsManagement', 'add'), runsDriverOrdersCtrl.createSingleDraftDriversToRuns)
app.get('/fetch-runs-drivers', auth.checkRole('RunsManagement', 'view'), runsDriverOrdersCtrl.fetchRuns);
app.delete('/delete/driver/:id', auth.checkRole('RunsManagement', 'edit'), runsDriverOrdersCtrl.deleteDriver);
app.get('/fetch-run-types-added', auth.checkRole('RunsManagement', 'view'), runsDriverOrdersCtrl.getRunTypesAdded);
app.get('/get/truck/:id', auth.checkRole('RunsManagement', 'edit'), runsDriverOrdersCtrl.fetchDeafultTruckByDriverId);
// Edited by Bhaskar c end

// app.get('/fetch-config-list', auth.checkRole('UserManagement', 'view'), configCtrl.getConfigList);
// app.post('/add-config', auth.checkRole('UserManagement', 'add'), configCtrl.createConfig);
// app.get('/fetch-specific-config/:id', auth.checkRole('UserManagement', 'view'), configCtrl.getConfigById);
// app.patch('/update-config/:id', auth.checkRole('UserManagement', 'edit'), configCtrl.updateConfig);
// app.delete('/delete-config/:id', auth.checkRole('UserManagement', 'view'), configCtrl.deleteConfig);

// Mud Map Upload
app.post('/upload-mud-map', auth.checkRole('Common', 'add'), upload.single('documents'), accountCtrl.uploadMudMap);
app.get('/get-mud-map', auth.checkRole('Common', 'view'), accountCtrl.getMudMap);

// Customer Notes routes
app.get('/fetch-customer-notes/:id',  auth.checkRole('Customer', 'view'), accountCtrl.fetchCustomerNotes);
app.post('/add-customer-note/:id', auth.checkRole('Customer', 'add'), accountCtrl.addCustomerNote);
app.patch('/update-specific-customer-note/:id', auth.checkRole('Customer', 'edit'), accountCtrl.updateCustomerNote);
//Code by Rahul

app.get('/fetch-swi-machine-detailed-report', auth.checkRole('Common', 'view'), fetchSWIMachineDetailedReport.fetchSWIMachineDetailedReport);
app.get('/fetch-swi-machine-offcuts-report', auth.checkRole('Common', 'view'), fetchSWIMachineOffcutsReport.fetchSWIMachineOffcutsReport);
app.get('/fetch-machine-data-dropdown', auth.checkRole('Common', 'view'), fetchMachineDataDropdown.fetchMachineDataDropdown);
app.get('/fetch-machine-material-colour-dropdown', auth.checkRole('Common', 'view'), fetchMachineMaterialColourDropdown.fetchMachineMaterialColourDropdown);
app.get('/fetch-folding-machines-dropdown', auth.checkRole('Common', 'view'), fetchFoldingMachinesDropdown.fetchFoldingMachinesDropdown);
app.get('/fetch-swi-machine-fold-report', auth.checkRole('Common', 'view'), fetchSWIMachineFoldReport.fetchSWIMachineFoldReport);
//End of code by Rahul

// Customer Feedback routes
app.get('/fetch-customer-feedbacks/:id', auth.checkRole('Customer', 'view'), accountCtrl.fetchCustomerFeedbacks);
app.post('/add-customer-feedback/:id', auth.checkRole('Customer', 'add'), accountCtrl.addCustomerFeedback);
app.patch('/update-customer-feedback/:id', auth.checkRole('Customer', 'edit'), accountCtrl.updateCustomerFeedback);
app.delete('/delete-customer-feedback/:id', auth.checkRole('Customer', 'edit'), accountCtrl.deleteCustomerFeedback);

// Map load apis

app.post("/api/compute-route", auth.checkRole('RunsManagement', 'view'), mapCtrl.computeRoutes);


app.post('/user-logout', userCtrl.userLogout)
//Code By Rahul
app.get('/fetch-order-details-by-ordernumber/:ordernumber', auth.checkRole('Common', 'view'), orderMgmtCtrl.fetchOrderDetailsByOrderNumber);
