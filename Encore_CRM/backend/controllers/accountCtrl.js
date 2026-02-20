const mongoose = require('mongoose');
const sql = require('mssql')
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const xlsx = require('xlsx'); 
const app = express();
const fs = require('fs');
const path = require('path');
const { logError } = require('../logger');
const config = require('../config/sqlConfig');

const { GetObjectCommand, S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const CustomerFeedback = require('../models/customerfeedbackModel');


app.use(session({
    secret: 'EncoreMyob',
    resave: false,
    saveUninitialized: false
}));

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

//Model Inclusion
const Account = require('../models/accountModel');
const AccountContact = require('../models/accountcontactModel');
const City = require('../models/cityModel');
const AccountAddress = require('../models/accountaddressModel');
const OrderMaster = require('../models/ordermasterModel');
let attrs = {options: true, new: true}; 

// MYOB Operations
async function loginMyob() {
    const payload = {
        name: ''+process.env.MYOBUserName+'',
        password: ''+process.env.MYOBPassword+'',
        company: ''+process.env.MYOBCompany+'',
        branch: ''+process.env.MYOBBranch+'',
      };
    const response = await axios.post(''+process.env.MYOBURLLogin+'login', payload);
    const headers = response.headers;
    const aspxAuthCookie = headers['set-cookie'].find(cookie => cookie.startsWith('.ASPXAUTH='));
    let aspxAuthValue;
    if (aspxAuthCookie) {
        aspxAuthValue = aspxAuthCookie.split(';')[0].split('=')[1];
        fs.writeFileSync('aspxauth.txt', aspxAuthValue);
    } else {
        console.log('.ASPXAUTH cookie not found');
    }
    return aspxAuthValue;
}

async function logoutMyob() {
    const payload = {
        name: ''+process.env.MYOBUserName+'',
        password: ''+process.env.MYOBPassword+'',
        company: ''+process.env.MYOBCompany+'',
        branch: ''+process.env.MYOBBranch+'',
    };
    await axios.post(''+process.env.MYOBURLLogin+'logout', payload);
    console.log('Logged Out');
}

async function addCustomerToMyob(accountName) {
    const apiUrl = ''+process.env.MYOBURL+'Customer';
      const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');
  
      if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH found.');
        return;
      }
      
      let customerName = accountName;

      let customerData = {
        "CurrencyID": {
            "value": "AUD"
        },
        "CurrencyRateType": {
            "value": "SPOT"
        },
        "CustomerClass": {
            "value": "CUSTDFT"
        },
        "CustomerName": {
            "value": ""+customerName+""
        },
        "TaxZone": {
            "value": "DOMESTIC"
        },
        "Terms": {
            "value": "DONM30DAYS"
        },
        "Status": {
            "value": "Active"
        },
        "SendInvoicesbyEmail": {
            "value": false
        },
        "SendStatementsbyEmail": {
            "value": false
        }
     }

      const headers = {
          Cookie: `.ASPXAUTH=${aspxAuthValue}`,
          'Content-Type': 'application/json'
        };
  
      // Make the API request to add sales order
      const response = await axios.put(apiUrl, customerData, { headers });
      const AddedCustomerID = response.data.CustomerID.value;  
      return AddedCustomerID;
}

async function addCustomerAddressToMyob(accountName, CustomerID, accountAddresslineone, accountAddresslinetwo, accountAddressCountry, accountAddressState, accountAddressCity, accountAddressPostalCode, accountAddressEmail, accountAddressPhone) {

    const apiUrl = ''+process.env.MYOBURL+'BusinessAccount';
    const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');

    if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH found.');
        return;
    }
      
    let customerAddressData = {
        "BusinessAccountID": {
            "value": ""+CustomerID+""
        },
        "MainAddress": {
            "AddressLine1": {
                "value": ""+accountAddresslineone+""
            },
            "AddressLine2": {
                "value": ""+accountAddresslinetwo+""
            },
            "City": {
                "value": ""+accountAddressCity+""
            },
            "Country": {
                "value": ""+accountAddressCountry+""
            },
            "PostalCode": {
                "value": ""+accountAddressPostalCode+""
            },
            "State": {
                "value": ""+accountAddressState+""
            },
            "custom": {}
        },
        "MainContact": {
            "CompanyName": {
                "value": ""+accountName+""
            },
            "Email": {
                "value": ""+accountAddressEmail+""
            },
            "Phone1": {
                "value": ""+accountAddressPhone+""
            },
            "custom": {}
        },
        "Name": {
            "value": ""+accountName+""
        },
        "Status": {
            "value": "Active"
        },
        "Type": {
            "value": "Customer"
        },
        "custom": {}
    }
    
    const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
        'Content-Type': 'application/json'
    };
  
    // Make the API request to add sales order
    const response = await axios.put(apiUrl, customerAddressData, { headers });
    const CustomerAddress = response.data;  
    return CustomerAddress;
}

async function fetchCustomerAddressToUpdate(accountCusID) {

    const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');
    if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH value found.');
        return;
    }

    const url = ''+process.env.MYOBURL+'BusinessAccount/'+accountCusID+'?$expand=MainAddress,MainContact';
    const headers = {
    Cookie: `.ASPXAUTH=${aspxAuthValue}`
    };

    const response = await axios.get(url, { headers });
    const CustomerAddressDetails = response.data; 
    return CustomerAddressDetails;
}

async function customerAddressToUpdate(customerObjID, mainAddressObjID, mainContactObjID, accountName, accountCusID, accountAddresslineone, accountAddresslinetwo, accountAddressCountry, accountAddressState, accountAddressCity, accountAddressPostalCode, accountAddressEmail, accountAddressPhone){
    const apiUrl = ''+process.env.MYOBURL+'BusinessAccount';
    const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');

    if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH found.');
        return;
    }
      
    let customerAddressData = {
        "id": ""+customerObjID+"",
        "BusinessAccountID": {
            "value": ""+accountCusID+""
        },
        "MainAddress": {
            "id": ""+mainAddressObjID+"",
            "AddressLine1": {
                "value": ""+accountAddresslineone+""
            },
            "AddressLine2": {
                "value": ""+accountAddresslinetwo+""
            },
            "City": {
                "value": ""+accountAddressCity+""
            },
            "Country": {
                "value": ""+accountAddressCountry+""
            },
            "PostalCode": {
                "value": ""+accountAddressPostalCode+""
            },
            "State": {
                "value": ""+accountAddressState+""
            },
            "custom": {}
        },
        "MainContact": {
            "id": ""+mainContactObjID+"",
            "CompanyName": {
                "value": ""+accountName+""
            },
            "Email": {
                "value": ""+accountAddressEmail+""
            },
            "Phone1": {
                "value": ""+accountAddressPhone+""
            },
            "custom": {}
        },
        "Name": {
            "value": ""+accountName+""
        },
        "Status": {
            "value": "Active"
        },
        "Type": {
            "value": "Customer"
        },
        "custom": {}
    }
    
    const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
        'Content-Type': 'application/json'
    };
  
    // Make the API request to add sales order
    const response = await axios.put(apiUrl, customerAddressData, { headers });
    const UpdatedCustomerAddress = response.data;  
    return UpdatedCustomerAddress;

}

async function customerContactDetails(CustomerUID, CustomerName, accountContactFName, accountContactLName, accountContactEmail, accountContactPhone){
    const apiUrl = ''+process.env.MYOBURL+'Contact';
    const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');

    if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH found.');
        return;
    }
      
    let customerContactData = {
        "Active": {
            "value": true
        },
        "BusinessAccount": {
            "value": ""+CustomerUID+""
        },
        "CompanyName": {
            "value": ""+CustomerName+""
        },
        "ContactClass": {
            "value": "DEFAULT"
        },
        "ContactID": {
            "value": ""
        },
        "DisplayName": {
            "value": ""+accountContactFName+""
        },
        "Email": {
            "value": ""+accountContactEmail+""
        },
        "FirstName": {
            "value": ""+accountContactFName+""
        },
        "LastName": {
            "value": ""+accountContactLName+""
        },
        "Phone1": {
            "value": ""+accountContactPhone+""
        },
        "Phone1Type": {
            "value": "Business 1"
        },
        "Status": {
            "value": "Active"
        },
        "custom": {}
    }
       
    const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
        'Content-Type': 'application/json'
    };
  
    // Make the API request to add sales order
    const response = await axios.put(apiUrl, customerContactData, { headers });
    const UpdatedCustomerAddress = response.data;  
    return UpdatedCustomerAddress;

}

async function customerPrimaryContactDetails(CustomerUID, CustomerName, accountContactFName, accountContactLName, accountContactEmail, accountContactPhone){
    const apiUrl = ''+process.env.MYOBURL+'BusinessAccount';
    const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');

    if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH found.');
        return;
    }
      
    let customerPrimaryContactData = {
        "BusinessAccountID": {
            "value": ""+CustomerUID+""
        },
        "Name": {
            "value": ""+CustomerName+""
        },
        "PrimaryContact": {
            "Active": {
                "value": true
            },
            "CompanyName": {
                "value": ""+CustomerName+""
            },
            "DisplayName": {
                "value": ""+accountContactFName+""
            },
            "Email": {
                "value": ""+accountContactEmail+""
            },
            "FirstName": {
                "value": ""+accountContactFName+""
            },
            "LastName": {
                "value": ""+accountContactLName+""
            },
            "Phone1": {
                "value": ""+accountContactPhone+""
            },
            "Status": {
                "value": "Active"
            },
            "custom": {}
        },
        "Status": {
            "value": "Active"
        },
        "Type": {
            "value": "Customer"
        }
    }
  
    const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
        'Content-Type': 'application/json'
    };
  
    // Make the API request to add sales order
    const response = await axios.put(apiUrl, customerPrimaryContactData, { headers });
    const UpdatedCustomerAddress = response.data;  
    return UpdatedCustomerAddress;

}

//CRM Operations
//Account Section
exports.addAccountData = async(req, res) =>{
    try{
        const accountName = req.body.account_Name;
        const accountAddresslineone = req.body.account_Address_line_one;
        const accountAddresslinetwo = req.body.account_Address_line_two;
        const accountAddressCountry = req.body.account_Address_Country;
        const accountAddressState = req.body.account_Address_State;
        const accountAddressCity = req.body.account_Address_City;
        const accountAddressPostalCode = req.body.account_Address_PostalCode;
        const accountAddressEmail = req.body.account_Address_Email;
        const accountAddressPhone = req.body.account_Address_Phone;
        const accountStoreAddress = req.body.account_StoreAddress;
        const accountStatus = req.body.account_Status;
        let CustomerID;
        let accountDatainfo;

        let aspxAuthValue = await loginMyob();
        if(aspxAuthValue){
            CustomerID = await addCustomerToMyob(accountName);
            if(CustomerID){
                await addCustomerAddressToMyob(accountName, CustomerID, accountAddresslineone, accountAddresslinetwo, accountAddressCountry, accountAddressState, accountAddressCity, accountAddressPostalCode, accountAddressEmail, accountAddressPhone );
                if(CustomerID){
                    const accountObj = new Account({
                        account_UID : CustomerID,
                        account_Name : accountName,
                        account_Address_line_one : accountAddresslineone,
                        account_Address_line_two : accountAddresslinetwo,
                        account_Address_Country : accountAddressCountry,
                        account_Address_State : accountAddressState,
                        account_Address_City : accountAddressCity,
                        account_Address_PostalCode : accountAddressPostalCode,
                        account_Address_Email : accountAddressEmail,
                        account_Address_Phone : accountAddressPhone,
                        account_StoreAddress: accountStoreAddress,
                        account_Status: accountStatus,
                    })
                    accountDatainfo = await accountObj.save();
                    if(accountDatainfo){
                        await sql.connect(config);
                        const insert = await sql.query("insert into Customers (Customer, CUID) values ('"+accountName+"', '"+CustomerID+"')");
                        console.dir(insert);  
                    }

                }else{
                    res.status(500).send("Customer Or Customer Address Adding Operation Failed");
                }
            }
            else{
                res.status(500).send("Customer Data Adding Failed");
            }
        }
        else{
            res.status(500).send("Login Failed");
        }
        await logoutMyob();
        res.status(200).send(accountDatainfo);
        res.end();
    }
    catch(err){ 
        logError('addAccountData', err, req.user.user_ref_id);
        res.status(500).send('Data Adding Failed.');
    }
}

exports.fetchAccountDataDropdown = async (req,res) => {
    try{
        let accountDetails = await Account.find({account_Status: "active"});
        res.send(accountDetails).status(200).end();
    }
    catch(err){
        logError('fetchAccountDataDropdown', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
}

exports.fetchAccountData = async (req, res) => {
    try {
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
        }

        let customerObj = {};
        let sortField = req.query.sortField || 'account_Name';
        let sortDirection = parseInt(req.query.sortDirection) || 1;
        let limiter = parseInt(req.query.pageSize) || 10;
        let pagination_value = parseInt(req.query.page) || 0;
        let skip_value = pagination_value * limiter;
        let searchParam = req.query.query || '';
        const escapedKeyword = escapeRegExp(searchParam);

        // Combine count and find into a single aggregate pipeline
        let aggregateQuery = [
            { 
                $match: { 
                    account_Name: { $regex: escapedKeyword, $options: "i" }
                }
            },
            {
                $facet: {
                    totalItems: [{ $count: "count" }],
                    fetchedItems: [
                        { $sort: { [sortField]: sortDirection } },
                        { $skip: skip_value },
                        { $limit: limiter }
                    ]
                }
            }
        ];

        let result = await Account.aggregate(aggregateQuery);
        let customerCount = result[0].totalItems.length ? result[0].totalItems[0].count : 0;
        let accountDetails = result[0].fetchedItems;
        customerObj.totalItems = customerCount;
        customerObj.fetchedItems = accountDetails;
        customerObj.rowsPerPage = limiter;
        customerObj.totalPages = Math.ceil(customerCount / limiter);
        res.status(200).send(customerObj).end();
    } catch (err) {
        logError('fetchAccountData', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
};

exports.fetchspecificaccountdata = async (req,res) => {
    try{
        let account_Id = req.params.id;
        let accountDetails = await Account.find({_id: account_Id});
        res.send(accountDetails).status(200).end();
    }
    catch(err){
        logError('fetchspecificaccountdata', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
}

exports.updatespecificaccountdata = async(req, res) =>{
    try{
        let account_Id = req.params.id;
        let accountDetails = await Account.find({_id: account_Id});
        let accountCusID = accountDetails[0].account_UID;
        let accountName = req.body.account_Name;
        let accountAddresslineone = req.body.account_Address_line_one;
        let accountAddresslinetwo = req.body.account_Address_line_two;
        let accountAddressCountry = req.body.account_Address_Country;
        let accountAddressState = req.body.account_Address_State;
        let accountAddressCity = req.body.account_Address_City;
        let accountAddressPostalCode = req.body.account_Address_PostalCode;
        let accountAddressEmail = req.body.account_Address_Email;
        let accountAddressPhone = req.body.account_Address_Phone;
        
        let aspxAuthValue = await loginMyob();
        let accountInfo 
        if(aspxAuthValue){
            let addressDetails = await fetchCustomerAddressToUpdate(accountCusID);
            if(addressDetails.id){
                let customerObjID = addressDetails.id;
                let mainAddressObjID = addressDetails.MainAddress.id;
                let mainContactObjID = addressDetails.MainContact.id;

                let updatedAddress = await customerAddressToUpdate(customerObjID, mainAddressObjID, mainContactObjID, accountName, accountCusID, accountAddresslineone, accountAddresslinetwo, accountAddressCountry, accountAddressState, accountAddressCity, accountAddressPostalCode, accountAddressEmail, accountAddressPhone);
                if(updatedAddress){
                    const account_Data = req.body;        
                    account_Data.updated = new Date().toISOString();
                    accountInfo = await Account.findByIdAndUpdate(account_Id, account_Data, attrs);

                    if(accountInfo){
                        await sql.connect(config);
                        const select = await sql.query("select * from Customers where CUID='"+accountCusID+"'");
                        console.dir(select);
                        const update = await sql.query("update Customers set Customer = '"+account_Data.account_Name+"' where CUID = '"+accountCusID+"'");
                        console.dir(update);
                    }
                }else{
                    res.status(500).send("Updating Operation Failed");
                }
            }else{
                res.status(500).send("Address Details Fetching Failed");
            }
        }else{
            res.status(500).send("Login Failed");
        }
        await logoutMyob();
        res.status(200).send(accountInfo);
        res.end();
    }
    catch(err){ 
        logError('updatespecificaccountdata', err, req.user.user_ref_id);
        res.status(500).send('Data Updation Failed.');
    } 
}

//Account Contact Section
exports.addAccountContactData = async(req, res) =>{
    try{
        const accountId = new mongoose.Types.ObjectId(req.params.id);
		const accountContactFName = req.body.account_Contact_FName;
		const accountContactLName = req.body.account_Contact_LName;
		const accountContactEmail = req.body.account_Contact_Email;
		const accountContactPhone = req.body.account_Contact_Phone;
        const accountContactStatus = req.body.account_Contact_Status;
        let CustomerInfo = await Account.find({_id: accountId});
        let CustomerUID = CustomerInfo[0].account_UID;
        let CustomerName = CustomerInfo[0].account_Name;
        let accountContactObj;
        let accountContact;
        let CustomerBasicContact;
        let CustomerPrimaryContactDetails;

        let aspxAuthValue = await loginMyob();
        if(aspxAuthValue){
            CustomerBasicContact = await customerContactDetails(CustomerUID, CustomerName, accountContactFName, accountContactLName, accountContactEmail, accountContactPhone);
            if(CustomerBasicContact || CustomerPrimaryContactDetails){
                accountContactObj = new AccountContact({
                    account_Id : accountId,
                    account_CUID : CustomerUID,
                    account_Contact_ContactID : CustomerBasicContact.ContactID.value,
                    account_Contact_FName : accountContactFName,
                    account_Contact_LName : accountContactLName,
                    account_Contact_Email: accountContactEmail,
                    account_Contact_Phone : accountContactPhone,
                    account_Contact_Status : accountContactStatus,
                })
                accountContact = await accountContactObj.save();  
                await logoutMyob();
            }
        }
        else{
            res.status(500).send("Login Failed");
        }
        res.status(200).send("Data Added Successfully");
        res.end();
    }
    catch(err){ 
        logError('addAccountContactData', err, req.user.user_ref_id);
        res.status(500).send('Data Adding Failed.');
    }
}

exports.fetchAccountContactData = async (req,res) => {
    try{
        let accountId = new mongoose.Types.ObjectId(req.params.id);
        let accountMode = req.params.mode;
        let accountContactDetails = await AccountContact.find({account_Id: accountId, account_Contact_Type: accountMode});
        res.send(accountContactDetails).status(200).end();
    }
    catch(err){
        logError('fetchAccountContactData', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
}

exports.fetchspecificaccountcontactdata = async (req,res) => {
    try{
        let accountContact_Id = req.params.id;
        let accountContactDetails = await AccountContact.find({_id: accountContact_Id});
        res.send(accountContactDetails).status(200).end();
    }
    catch(err){
        logError('fetchspecificaccountcontactdata', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
}

exports.deleteAccountSiteContact = async (req, res) => {
    try {
        let accountContact_Id = new mongoose.Types.ObjectId(req.params.id);
        let deletedContact = await AccountContact.findByIdAndDelete(accountContact_Id);
        if (!deletedContact) {
            return res.status(500).send("Contact Not Found!!!").end();
        }
        res.status(200).send("Data Deleted Successfully");
    } catch (err) {
        logError('deleteAccountSiteContact', err, req.user.user_ref_id);
        res.status(500).send('Data Deletion Failed.');
    }
};

exports.updatespecificaccountcontactdata = async(req, res) =>{
    try{
        let accountContact_Id = new mongoose.Types.ObjectId(req.params.id);
        let accountContactDetails = await AccountContact.find({_id: accountContact_Id});
        let accountID = new mongoose.Types.ObjectId(accountContactDetails[0].account_Id);
        let accountCusID = accountContactDetails[0].account_CUID;
        let accountContactContactID = accountContactDetails[0].account_Contact_ContactID;
        let accountContactFName = req.body.account_Contact_FName;
        let accountContactEmail = req.body.account_Contact_Email;
        let accountContactPhone = req.body.account_Contact_Phone;
        let accountVerified = req.body.account_Contact_Verified;
        let updatedaccountContactInfo;

        const duplicateContact = await AccountContact.findOne({
            account_Id: accountID,
            account_Contact_Phone: accountContactPhone,
            _id: { $ne: accountContact_Id } // Exclude current record
        });

        if (duplicateContact) {
            return res.status(500).send("Phone number already assigned. Please check!").end();
        }

        if(req.params.mode === "Store"){
            let aspxAuthValue = await loginMyob();
            if(aspxAuthValue){
                let UpdateCustomerContact = await customerContactDetailsUpdate(accountCusID, accountContactContactID, accountContactFName, accountContactEmail, accountContactPhone);
                if(UpdateCustomerContact){
                    const accountContact_Data = req.body;        
                    accountContact_Data.updated = new Date().toISOString();
                    accountContact_Data.account_Contact_Verified = accountVerified;
                    updatedaccountContactInfo = await AccountContact.findByIdAndUpdate(accountContact_Id, accountContact_Data, attrs);
                }
            }else{
                res.status(500).send("Login Failed");
            }
            await logoutMyob();
        }else{
                const accountContact_Data = req.body;        
                accountContact_Data.updated = new Date().toISOString();
                accountContact_Data.account_Contact_Verified = accountVerified;
                updatedaccountContactInfo = await AccountContact.findByIdAndUpdate(accountContact_Id, accountContact_Data, attrs);
        }
        res.status(200).send("Data Updated Successfully");
        res.end();
    }
    catch(err){ 
        logError('updatespecificaccountcontactdata', err, req.user.user_ref_id);
        res.status(500).send('Data Updation Failed.');
    } 
}

async function customerContactDetailsUpdate(accountCusID, accountContactContactID, accountContactFName, accountContactEmail, accountContactPhone){
    const apiUrl = ''+process.env.MYOBURL+'Contact';
    const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');

    if (!aspxAuthValue) {
        res.status(500).send('No .ASPXAUTH found.');
        return;
    }
      
    let customerContactData = {
        "BusinessAccount": {
            "value": ""+accountCusID+""
        },
        "ContactID": {
            "value": ""+accountContactContactID+""
        },
        "DisplayName": {
            "value": ""+accountContactFName+""
        },
        "Email": {
            "value": ""+accountContactEmail+""
        },
        "FirstName": {
            "value": ""+accountContactFName+""
        },
        "Phone1": {
            "value": ""+accountContactPhone+""
        },
        "Phone1Type": {
            "value": "Business 1"
        },
        "Status": {
            "value": "Active"
        }
    }
       
    const headers = {
        Cookie: `.ASPXAUTH=${aspxAuthValue}`,
        'Content-Type': 'application/json'
    };
  
    // Make the API request to add sales order
    const response = await axios.put(apiUrl, customerContactData, { headers });
    const UpdatedCustomerContact = response.data;  
    return UpdatedCustomerContact;

}

exports.fetchCustomerListWithDetailsFromMyob = async(req, res) =>{
    try{

        let aspxAuthValue = await loginMyob();
        if(aspxAuthValue){
            const apiUrl = ''+process.env.MYOBURL+'Customer?$expand=ShippingContact/Address,Contacts/Contact';
            const aspxAuthValue = fs.readFileSync('aspxauth.txt', 'utf8');
          
            if (!aspxAuthValue) {
                res.status(500).send('No .ASPXAUTH found.');
                return;
            }
            const headers = {
                Cookie: `.ASPXAUTH=${aspxAuthValue}`,
                'Content-Type': 'application/json'
            };
          
            //Make the API request to Fetch Customer Details
            const response = await axios.get(apiUrl, { headers });
            const customerArray = response.data;
            const customerArrayLength = customerArray.length;

            for(i=0; i<customerArrayLength; i++){
                let Customer_ID = customerArray[i].CustomerID.value;
                let Customer_Name = customerArray[i].CustomerName.value;
                let Customer_Address_line_one = customerArray[i].ShippingContact.Address.AddressLine1.value;
                let Customer_Address_line_two = customerArray[i].ShippingContact.Address.AddressLine2.value;
                let Customer_Address_Country = customerArray[i].ShippingContact.Address.Country.value;
                let Customer_Address_State = customerArray[i].ShippingContact.Address.State.value;
                let Customer_Address_City = customerArray[i].ShippingContact.Address.City.value;
                let Customer_Address_PostalCode = customerArray[i].ShippingContact.Address.PostalCode.value;
                let Customer_Address_Phone = customerArray[i].ShippingContact.Phone1.value;
                let Customer_Address_Email = customerArray[i].ShippingContact.Email.value;
                let Customer_StoreAddress = customerArray[i].CustomerName.value;
                let Customer_Terms = customerArray[i].Terms.value;

                let checkAccountDetailsExist = await Account.find({account_UID: Customer_ID});
                if(checkAccountDetailsExist.length){
                    let updateData = { $set: { 
                        "account_Name": Customer_Name, 
                        "account_Address_line_one": Customer_Address_line_one, 
                        "account_Address_line_two": Customer_Address_line_two,
                        "account_Address_Country": Customer_Address_Country, 
                        "account_Address_State": Customer_Address_State, 
                        "account_Address_City": Customer_Address_City,
                        "account_Address_PostalCode": Customer_Address_PostalCode, 
                        "account_Address_Email": Customer_Address_Email,
                        "account_Address_Phone": Customer_Address_Phone, 
                        "account_StoreAddress": Customer_StoreAddress,
                        "account_Terms": Customer_Terms
                    }};
                    let conditions = { account_UID: Customer_ID};
                    let updatedCustomerInfo = await Account.findOneAndUpdate(conditions, updateData, attrs);
                    if(updatedCustomerInfo){

                        for(j=0; j<customerArray[i].Contacts.length; j++){
                            let Customer_Contact_ContactID = customerArray[i].Contacts[j].Contact.ContactID.value;
                            let Customer_Contact_Name = customerArray[i].Contacts[j].Contact.DisplayName.value;
                            let Customer_Contact_Phone = customerArray[i].Contacts[j].Contact.Phone1.value;
                            let Customer_Contact_Email = customerArray[i].Contacts[j].Contact.Email.value;

                            let checkAccountContactDetailsExist = await AccountContact.find({account_Contact_ContactID: Customer_Contact_ContactID});
                            if(checkAccountContactDetailsExist.length){
                                let updateContactData = { $set: { 
                                    "account_Contact_FName": Customer_Contact_Name,
                                    "account_Contact_Email": Customer_Contact_Email, 
                                    "account_Contact_Phone": Customer_Contact_Phone,
                                }};
                                let updateconditions = { account_Contact_ContactID: Customer_Contact_ContactID};
                                await AccountContact.updateOne(updateconditions, updateContactData, attrs);
                            }else{
                                const accountContactObj = new AccountContact({
                                    account_Id : updatedCustomerInfo._id,
                                    account_CUID : Customer_ID,
                                    account_Contact_ContactID : Customer_Contact_ContactID,
                                    account_Contact_FName : Customer_Contact_Name,
                                    account_Contact_Email : Customer_Contact_Email, 
                                    account_Contact_Phone : Customer_Contact_Phone,
                                })
                                await accountContactObj.save();
                            }
                        }
                    }
                }else{
                    const accountObj = new Account({
                        account_UID : Customer_ID,
                        account_Name : Customer_Name,
                        account_Address_line_one : Customer_Address_line_one,
                        account_Address_line_two : Customer_Address_line_two, 
                        account_Address_Country : Customer_Address_Country,
                        account_Address_State : Customer_Address_State,
                        account_Address_City : Customer_Address_City,
                        account_Address_PostalCode : Customer_Address_PostalCode,
                        account_Address_Email : Customer_Address_Phone,
                        account_Address_Phone : Customer_Address_Email,
                        account_StoreAddress: Customer_StoreAddress,
                        account_Terms: Customer_Terms
                    })
                    let accountDatainfo = await accountObj.save();
                    if(accountDatainfo){

                        // SWI Row Insertion
                        let cleanedCustomerName = Customer_Name.replace(/['"]/g, '');
                        await sql.connect(config);
                        const insert = await sql.query("insert into Customers (Customer, CUID) values ('"+cleanedCustomerName+"', '"+Customer_ID+"')");
                        console.dir(insert);  
                        await sql.close();
        
                        for(j=0; j<customerArray[i].Contacts.length; j++){
                            let Customer_Contact_ContactID = customerArray[i].Contacts[j].ContactID.value;
                            let Customer_Contact_Name = customerArray[i].Contacts[j].Contact.DisplayName.value;
                            let Customer_Contact_Phone = customerArray[i].Contacts[j].Contact.Phone1.value;
                            let Customer_Contact_Email = customerArray[i].Contacts[j].Contact.Email.value;
                            const accountContactObj = new AccountContact({
                                account_Id : accountDatainfo._id,
                                account_CUID : Customer_ID,
                                account_Contact_ContactID : Customer_Contact_ContactID,
                                account_Contact_FName : Customer_Contact_Name,
                                account_Contact_Email : Customer_Contact_Email, 
                                account_Contact_Phone : Customer_Contact_Phone,
                            })
                            await accountContactObj.save();
                        }
                    }else{
                        console.log("New Customer Row Insertion Failled");
                    }
                }
            }
        }
        else{
            res.status(500).send("Login Failed");
        }
        await logoutMyob();
        res.status(200).send("Data Updated successfully");
        res.end();
    }
    catch(err){ 
        logError('fetchCustomerListWithDetailsFromMyob', err, req.user.user_ref_id);; 
        res.status(500).send("Data Fetching Failed");
    }
}

exports.addNewCityData = async (req, res) => {
    try {
        const { city_Name, ...otherData } = req.body;
        if (!city_Name || city_Name.trim() === "") {
            const err = new Error("City name is required");
            logError('addNewCityData', err, req.user.user_ref_id);
            return res.status(500).send("City name is required.");
        }
        const existingCity = await City.findOne({ city_Name: city_Name.trim() });
        if (existingCity) {
            const err = new Error("City already exists. Please recheck.");
            logError('addNewCityData', err, req.user.user_ref_id);
            return res.status(500).send("City already exists. Please recheck.");
        }
        const cityData = { city_Name: city_Name.trim(), ...otherData };
        await City.create(cityData);
        res.status(200).send('Data Added Successfully.');
    } catch (err) {
        logError('addNewCityData', err, req.user.user_ref_id);
        res.status(500).send("Data Adding Failed");
    }
};

exports.fetchCityData = async (req, res) => {
    try {
        const limit = 20;
        const page = req.query.page || 0;
        const skip = page * limit;
        const searchKeyword = req.query.query;
        const searchFilter = {};

        function escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        if (searchKeyword) {
            const escapedKeyword = escapeRegex(searchKeyword);
            searchFilter.$or = [
                { city_Name: { $regex: escapedKeyword, $options: "i" } },
                { city_Pincode: { $regex: escapedKeyword, $options: "i" } },
                { city_Rack: { $regex: escapedKeyword, $options: "i" } },
            ];
        }

        const total_cities = await City.find({
            ...searchFilter,
        });
        let total_cities_count = total_cities.length;
        let cityDetails = await City.aggregate([
            {
                $match: {
                    ...searchFilter,
                },
            },
            { $sort: { city_Name: 1 } },
            { $lookup: { from: "rackings", as: "rackingsdetails", localField: "city_Rack", foreignField: "_id" } },
            {
                $project: {
                    _id: 1,
                    city_Name: 1,
                    city_State: 1,
                    city_Country: 1,
                    city_Pincode: 1,
                    city_FarSuburb: 1,
                    city_Rack: 1,
                    city_Status: 1,
                    created: 1,
                }
            }
        ]).skip(skip) .limit(limit);
        const pages = Math.ceil(total_cities_count / limit);
        const fullObj = {
            totalItems: total_cities_count,
            fetchedItems: cityDetails,
            rowsPerPage: limit,
            totalPages: pages,
        };
        res.status(200).send(fullObj);
    }
    catch (err) { 
        logError('fetchCityData', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed");
    }
}

exports.fetchCityDataDropdown = async (req, res) => {
    try {
        const cityDetails = await City.find().sort({ city_Name: 1 });
        res.status(200).send(cityDetails);
    } catch (err) {
        logError('fetchCityDataDropdown', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
};

exports.fetchSpecificCityData = async (req, res) => {
    try {
        const city_Id = req.params.id;
        const cityDetails = await City.find({ _id: city_Id});
        res.status(200).send(cityDetails);
    } catch (err) {
        logError('fetchSpecificCityData', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed");
    }
};

exports.updateSpecificCityData = async (req, res) => {
    try {
        let city_Id = req.params.id;
        const city_Data = req.body;
        city_Data.updated = new Date().toISOString();
        let cityInfo = await City.findByIdAndUpdate(city_Id, city_Data, { new: true });
        if (!cityInfo) {
            return res.status(500).send("City not found");
        }
        res.status(200).send('Data Updated Successfully.');
    } catch (err) {
        logError('updateSpecificCityData', err, req.user.user_ref_id);
        res.status(500).send("Data Updation Failed");
    }
};

exports.fetchAccountAddressData = async (req,res) => {
    try{
        let accountId = new mongoose.Types.ObjectId(req.params.id);
        let accountAddressDetails = await AccountAddress.find({account_Id: accountId});
        res.send(accountAddressDetails).status(200).end();
    }
    catch(err){
        logError('fetchAccountAddressData', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
}

exports.fetchSpecificAccountAddressData = async (req,res) => {
    try{
        let accountAddres_Id = new mongoose.Types.ObjectId(req.params.id);
        let accountAddressDetails = await AccountAddress.find({_id: accountAddres_Id});
        res.send(accountAddressDetails).status(200).end();
    }
    catch(err){
        logError('fetchSpecificAccountAddressData', err, req.user.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
}

exports.updateSpecificAccountAddressData = async (req, res) => {
  try {
    let accountAddres_Id = new mongoose.Types.ObjectId(req.params.id);
    const address_Data = req.body;
    address_Data.updated = new Date().toISOString();
    await AccountAddress.findByIdAndUpdate(accountAddres_Id, address_Data, attrs);
    res.status(200).send('Data Updation Successfully.');
    res.end();
  }
  catch (err) { 
        logError('updateSpecificAccountAddressData', err, req.user.user_ref_id); 
        res.status(500).send('Data Updation Failed.');
    }
}

// upload mud map to aws s3 bucket
exports.uploadMudMap = async (req, res) => {
    try {

        if (req.file) {
            const command = new GetObjectCommand({
                Bucket: 'encore-sheet',
                Key: req.file.key
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            res.status(200).send({
                key: req.file.key,
                url: url
            });
        } else {
            res.status(400).send("No file uploaded.");
        }

    } catch (err) {
        logError('uploadMudMap', err, req.user?.user_ref_id);
        res.status(500).send('Mud Map Upload Failed.');
    } 
};


exports.getMudMap = async (req, res) => {
    try {
        const mudMapKey = req.query.mudMapKey;

        if (!mudMapKey) {
            return res.status(400).send("Mud map key is required.");
        }

        // Step 1: Check in OrderMaster
        let existsInOrder = await OrderMaster.findOne({ order_site_delivery_mud_map: mudMapKey }).lean();

        // Step 2: If not found, check in AccountAddress
        let existsInAccount = null;
        if (!existsInOrder) {
            existsInAccount = await AccountAddress.findOne({ account_Mud_Map: mudMapKey }).lean();
        }

        // Step 3: Generate signed S3 URL
        const command = new GetObjectCommand({
            Bucket: 'encore-sheet',
            Key: mudMapKey
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        res.status(200).send({
            key: mudMapKey,
            url: url,
        });
    } catch (err) {
        console.error('Error in getMudMap:', err);
        logError('getMudMap', err, req.user?.user_ref_id);
        res.status(500).send('Failed to retrieve Mud Map.');
    }
};

// Fetch customer notes by account ID
exports.fetchCustomerNotes = async (req, res) => {
    try {
        const accountId = req.params.id;
        const accountDetails = await Account.findById(accountId)
            .select('account_Notes_Delivery_Mode accounts_Notes');
        
        if (!accountDetails) {
            return res.status(404).send('Account not found');
        }

        // Return notes in array format for consistency
        const notesData = {
            _id: accountDetails._id,
            notes: accountDetails.accounts_Notes || '',
        };

        res.status(200).send([notesData]);
    } catch (err) {
        logError('fetchCustomerNotes', err, req.user?.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
};

// Add customer notes
exports.addCustomerNote = async (req, res) => {
    try {
        const accountId = req.params.id;
        const { notes } = req.body;

        // Validate word count (max 30 words)
        const wordCount = notes.trim().split(/\s+/).filter(word => word.length > 0).length;
        if (wordCount > 30) {
            return res.status(400).send('Notes must not exceed 30 words');
        }

        const updateData = {
            accounts_Notes: notes,
            updated: new Date().toISOString()
        };

        const updatedAccount = await Account.findByIdAndUpdate(
            accountId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedAccount) {
            return res.status(404).send('Account not found');
        }

        res.status(200).send('Customer note added successfully');
    } catch (err) {
        logError('addCustomerNote', err, req.user?.user_ref_id);
        res.status(500).send('Note addition failed.');
    }
};

// Update customer notes
exports.updateCustomerNote = async (req, res) => {
    try {
        const accountId = req.params.id;
        const { notes } = req.body;

        // Validate word count (max 30 words)
        const wordCount = notes.trim().split(/\s+/).filter(word => word.length > 0).length;
        if (wordCount > 30) {
            return res.status(400).send('Notes must not exceed 30 words');
        }

        const updateData = {
            accounts_Notes: notes,
            updated: new Date().toISOString()
        };

        const updatedAccount = await Account.findByIdAndUpdate(
            accountId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedAccount) {
            return res.status(404).send('Account not found');
        }

        res.status(200).send('Customer note updated successfully');
    } catch (err) {
        logError('updateCustomerNote', err, req.user?.user_ref_id);
        res.status(500).send('Note update failed.');
    }
};


// ==================== CUSTOMER FEEDBACK APIS ====================

// Fetch all feedbacks for a specific customer
exports.fetchCustomerFeedbacks = async (req, res) => {
    try {
        const customerId = req.params.id;
        
        const feedbacks = await CustomerFeedback.find({ customer_id: customerId })
            .sort({ created: -1 }); // Latest first
        
        res.status(200).send(feedbacks);
    } catch (err) {
        logError('fetchCustomerFeedbacks', err, req.user?.user_ref_id);
        res.status(500).send('Data Fetching Failed.');
    }
};

// Add new customer feedback
exports.addCustomerFeedback = async (req, res) => {
    try {
        const customerId = req.params.id;
        const { feedback_text } = req.body;

        if (!feedback_text || feedback_text.trim() === '') {
            return res.status(400).send('Feedback text is required');
        }

        const newFeedback = new CustomerFeedback({
            customer_id: customerId,
            feedback_text: feedback_text,
            created: new Date().toISOString()
        });

        await newFeedback.save();
        
        res.status(200).send('Feedback added successfully');
    } catch (err) {
        logError('addCustomerFeedback', err, req.user?.user_ref_id);
        res.status(500).send('Feedback addition failed.');
    }
};

// Update specific customer feedback
exports.updateCustomerFeedback = async (req, res) => {
    try {
        const feedbackId = req.params.id;
        const { feedback_text } = req.body;

        if (!feedback_text || feedback_text.trim() === '') {
            return res.status(400).send('Feedback text is required');
        }

        const updateData = {
            feedback_text: feedback_text,
            updated: new Date().toISOString()
        };

        const updatedFeedback = await CustomerFeedback.findByIdAndUpdate(
            feedbackId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedFeedback) {
            return res.status(404).send('Feedback not found');
        }

        res.status(200).send('Feedback updated successfully');
    } catch (err) {
        logError('updateCustomerFeedback', err, req.user?.user_ref_id);
        res.status(500).send('Feedback update failed.');
    }
};

// Delete specific customer feedback (optional - if you want delete functionality)
exports.deleteCustomerFeedback = async (req, res) => {
    try {
        const feedbackId = req.params.id;

        const deletedFeedback = await CustomerFeedback.findByIdAndDelete(feedbackId);

        if (!deletedFeedback) {
            return res.status(404).send('Feedback not found');
        }

        res.status(200).send('Feedback deleted successfully');
    } catch (err) {
        logError('deleteCustomerFeedback', err, req.user?.user_ref_id);
        res.status(500).send('Feedback deletion failed.');
    }
};


exports.deleteAccountSiteAddress = async (req, res) => {
    try {
        let accountAddres_Id = new mongoose.Types.ObjectId(req.params.id);
        let deleteAddress = await AccountAddress.findByIdAndDelete(accountAddres_Id);
        if (!deleteAddress) {
            return res.status(500).send("Address Not Found!!!").end();
        }
        res.status(200).send("Data Deleted successfully");
    } catch (err) {
        logError('deleteAccountSiteAddress', err, req.user.user_ref_id);
        res.status(500).send('Data Deletion Failed.');
    }
};

exports.bulkImportCity = async (req, res) => {
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

      const existingRowsCount = await City.countDocuments();
      if (existingRowsCount === 0) {
        // Insert all rows from the sheet into the database
        const bulkInsertOperations = jsonData.map(async (item) => {
          if (item.City_Name) {
            const CityData = new City({
                city_Name: item.City_Name,
                city_State: item.State || "VIC",
                city_Country: "AU",
                city_Pincode: item.Postal_Code,
                city_FarSuburb: item.Far_Suburb,
                city_Rack: item.Rack_Number,
                city_Status:"active"
            });
            await CityData.save();
          } else {
            console.warn("Skipping row without a valid City");
          }
        });
        await Promise.all(bulkInsertOperations);
      } else {
        const bulkOperations = jsonData.map(async (item) => {
          const CityName = item.City_Name;
          if (!CityName) {
            console.warn("Skipping row without a valid City Name");
            return;
          }

          const CityState = item.State || "VIC";
          const CityCountry = "AU";
          const CityPIN = item.Postal_Code;
          const CitySuburb = item.Far_Suburb;
          const CityRack = item.Rack_Number;

          const checkIDExistance = await City.findOne({ city_Name: CityName });
          if (checkIDExistance) {
            const updateData = {
              $set: {
                city_Name: CityName,
                city_State: CityState,
                city_Country: CityCountry,
                city_Pincode: CityPIN,
                city_FarSuburb: CitySuburb,
                city_Rack: CityRack,
              },
            };
            const conditions = { _id: checkIDExistance._id };
            await City.updateOne(conditions, updateData);
          } else {
            const CitAddData = new City({
                city_Name: CityName,
                city_State: CityState,
                city_Country: "AU",
                city_Pincode: CityPIN,
                city_FarSuburb: CitySuburb,
                city_Rack: CityRack,
                city_Status:"active"
            });
            await CitAddData.save();
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
    res.status(200).send("Data imported successfully");
  } catch (err) {
    logError('bulkImportCity', err, req.user.user_ref_id);
    res.status(500).send("Data Import Failed");
  }
};

exports.bulkExportCity = async (req,res) => {
    try{
        let CityData = await City.find({city_Status: "active"}).sort({ city_Name: 1 });;
        res.send(CityData).status(200).end();
    }
    catch(err){
        logError('bulkExportCity', err, req.user.user_ref_id);
        res.status(500).send("Data Export Failed");
    }
}

exports.deleteSpecificCityData = async (req, res) => {
    try {
        let City_Id = new mongoose.Types.ObjectId(req.params.id);
        let deleteCity = await City.findByIdAndDelete(City_Id);
        if (!deleteCity) {
            const err = new Error("City Not Found");
            logError('deleteSpecificCityData', err, req.user.user_ref_id);
            return res.status(500).send("City Not Found!!!");
        }
        res.status(200).send("Deleted Succesfully");
    } catch (err) {
        logError('deleteSpecificCityData', err, req.user.user_ref_id);
        res.status(500).send("Data Deletion Failed.");
    }
};