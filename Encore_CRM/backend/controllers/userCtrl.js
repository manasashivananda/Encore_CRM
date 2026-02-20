const mongoose = require('mongoose');
const Users = require('../models/userModel');
const Roles = require('../models/roleModel');
const Modules = require('../models/modulesModel');
const RolesPermission = require('../models/rolepermissionModel');
const LoginUsers = require('../models/loginModel');
const OrderMaster = require('../models/ordermasterModel');
const LoginLogs = require('../models/loginLogs');

let attrs = { options: true, new: true };
const CryptoJS = require("crypto-js");
let bcrypt = require('bcryptjs');
const jwt = require("jsonwebtoken");
const nodemailer = require('nodemailer');
let randomstring = require("randomstring");
const { logError } = require('../logger');
const { otpAuthentication } = require('./otpAuthCtrl');
const { handleMongooseError, getEmpRolesAndPermissions } = require('./common');

//Login Section
exports.userLogin = async (req, res) => {
    try {
        const encryptionKey = process.env.ENCRYPTION_KEY; // Ensure this is set in env
        const tokenKey = process.env.TOKEN_KEY;
        if(!encryptionKey){
            return res.status(500).send("Encryption key is missing in server configuration.");
        }
        if (!tokenKey) {
            return res.status(500).send("Token key is missing in server configuration.");
        }

        let decryptedEmail = CryptoJS.AES.decrypt(req.body.user_email, encryptionKey).toString(CryptoJS.enc.Utf8);
        let decryptedPassword = CryptoJS.AES.decrypt(req.body.password, encryptionKey).toString(CryptoJS.enc.Utf8);

        // console.log(decryptedCoords)
        if (!decryptedEmail || !decryptedPassword) {
            return res.status(400).send("Invalid decryption keys or malformed data.");
        }
        let specificUser = await Users.find({ user_Email: decryptedEmail, user_status: "active" });
        if (specificUser.length === 0) {
            return res.status(404).send("No user exists with the submitted email.");
        }

        const userId = new mongoose.Types.ObjectId(specificUser[0]._id);
            const [userDept] = await Users.aggregate([
              { $match: { _id: userId } },
              {
                $lookup: {
                  from: 'roles',                 // adjust collection name if different
                  localField: 'user_Role',
                  foreignField: '_id',
                  as: 'roleInfo'
                }
              },
              { $unwind: '$roleInfo' },
              {
                $project: {
                  depts: '$roleInfo.depts'
                }
              }
            ]);

        if (specificUser.length > 0) {
            let user = await LoginUsers.findOne({ user_email: decryptedEmail });
            // Check expiration_date_time
            if (user?.expire_date_time && new Date() > new Date(user?.expire_date_time)) {
                await LoginUsers.updateOne(
                    { _id: user._id },
                    { 
                        expire_date_time: null,
                        login_status: false
                    }

                );
            }
            user = await LoginUsers.findOne({ user_email: decryptedEmail });
            if (!user || !(await bcrypt.compare(decryptedPassword, user.password))) {
                return res.status(400).send("Invalid credentials.");
            }
            let responseObj = {}
            // Fetch user roles and permissions
            const otpAuth = await otpAuthentication(specificUser[0]);
            if(user?.login_status){
                responseObj = await getEmpRolesAndPermissions(user.user_ref_id);
                // Create token
                const token = jwt.sign(
                    { user_id: user._id, user_email: decryptedEmail, user_ref_id: user.user_ref_id, user_role: responseObj },
                    tokenKey,
                    {
                        expiresIn: "12h",
                    }
                );
                const constants = {
                    AWF_CUSTOMER_ID : process.env.AWF_CUSTOMER_ID,
                    AWF_ORDER_SERIES : process.env.AWF_ORDER_SERIES
                }
                // save user token
            
                user.token = token;
                responseObj.depts = Array.isArray(userDept.depts) ? userDept?.depts : []
                responseObj.login = user;
                responseObj.constants = constants
            }
            responseObj.auth = otpAuth;
            res.status(200).json(responseObj);

        } else {
            return res.status(500).send("No User Exists With Submitted Username!");
        }
    } catch (err) {
        logError('UserLogin', err);
        console.log(err)
        return res.status(500).send("Internal server error");
    }
}

exports.userChangePassword = async (req, res) => {
    try {
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (!encryptionKey) {
            return res.status(500).send("Encryption key is missing in server configuration.");
        }

        let decryptedCurrentPassword = CryptoJS.AES.decrypt(req.body.currentPassword, encryptionKey).toString(CryptoJS.enc.Utf8);
        let decryptedNewPassword = CryptoJS.AES.decrypt(req.body.newPassword, encryptionKey).toString(CryptoJS.enc.Utf8);
        const user_ref_id = req.body.user_ref_id;
        if (!(user_ref_id && decryptedCurrentPassword && decryptedNewPassword)) {
            return res.status(500).send("All input is required.");
        }

        const user = await LoginUsers.findOne({ user_ref_id });
        if (!user) {
            return res.status(500).send("User not found.");
        }

        const isMatch = await bcrypt.compare(decryptedCurrentPassword, user.password);
        if (!isMatch) {
            return res.status(500).send("Check your old password.");
        }
        const encryptedPassword = await bcrypt.hash(decryptedNewPassword, 10);
        await LoginUsers.findOneAndUpdate({ user_ref_id }, { password: encryptedPassword });
        return res.status(200).send("Password updated successfully");
    } catch (err) {
        logError('userChangePassword', err, req.user.user_ref_id);
        return res.status(500).send("Data Updation Failed.");
    }
};

exports.userForgotPassword = async(req, res)=>{
	try{
		
		let email_id = req.body.email_id;
		let reportingPersonemail = email_id;
		const user = await LoginUsers.findOne({user_email: email_id});
		if (user){
			let securityToken = randomString();
			await LoginUsers.findOneAndUpdate({user_email: email_id}, {securityToken: securityToken}).exec();
			
			let mailTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user: `${process.env.From_Email}`, pass: `${process.env.From_Email_PW}` } });
			let fullUrl = `${process.env.FullURL}`;
			let mailOptions = {
				from: `${process.env.From_Email}`,
				to: `${reportingPersonemail}`,
				cc: `${process.env.From_Email_CC}`,
				subject: `ENCORE Forgot Password Email`,
				html: ` <p>Hi ${email_id},</br></p>
						<p>Please click this url to update your password. <a href="${fullUrl}/update-password/${securityToken}" target="_blank">Click Here</a></p>
						<br> 
						<p>Thanks</p
						<p>System Administrator</p>`,
			};
			mailTransporter.sendMail(mailOptions, function(error, info){
				if (error) { console.log(error); }
				else { console.log('Email sent: ' + info.response); }
			});
			res.status(200).send("Security Token sent to email successfully").end();
		}else{
			res.status(400).send("Couldn't find your account");
		}
	}catch(err){
		logError('userForgotPassword', err, req.user.user_ref_id);
        return res.status(500).send("Data Updation Failed.");
	}
}

exports.userUpdateForgotPassword = async (req, res) => {
    try {
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (!encryptionKey) {
            return res.status(500).send("Encryption key is missing in server configuration.");
        }

        const securityToken = req.body.securityToken;
        const encryptedNewPassword = req.body.newPassword;
        if (!securityToken || !encryptedNewPassword) {
            return res.status(500).send("All input is required.");
        }

        let decryptedNewPassword = CryptoJS.AES.decrypt(encryptedNewPassword, encryptionKey).toString(CryptoJS.enc.Utf8);
        if (!decryptedNewPassword) {
            return res.status(500).send("Invalid decryption keys or malformed data.");
        }

        const user = await LoginUsers.findOne({ securityToken });
        if (!user) {
            return res.status(500).send("Security token expired or account not found. Please try again later.");
        }

        const encryptedPassword = await bcrypt.hash(decryptedNewPassword, 10);
        await LoginUsers.findOneAndUpdate(
            { user_ref_id: user.user_ref_id },
            { password: encryptedPassword, securityToken: "" }
        );

        const mailTransporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.From_Email,
                pass: process.env.From_Email_PW,
            },
        });

        const mailOptions = {
            from: process.env.From_Email,
            to: user.user_email,
            cc: process.env.From_Email_CC,
            subject: "Password Updated Successfully for ENCORE",
            html: `
                <p>Hi ${user.user_email},</p>
                <p>Your password has been successfully updated using forgot password. If this was not you, please contact the administrator.</p>
                <br> 
                <p>Thanks,</p>
                <p>System Administrator</p>
            `,
        };

        mailTransporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
            } else {
                console.log("Email sent:", info.response);
            }
        });
        return res.status(200).json({ message: "Password updated successfully." });

    } catch (err) {
        logError('userUpdateForgotPassword', err, req.user.user_ref_id);
        return res.status(500).send("Data Updation Failed.");
    }
};

exports.fetchSpecificProfile = async (req, res) => {
    try {
        let DoubtCount = await OrderMaster.countDocuments({
            order_doubt_status: { $in: ["1", "2"] }
        });
        let SupplierCount = await OrderMaster.countDocuments({
            order_supplier_status: { $in: ["1"] }
        });

        let user_Id = new mongoose.Types.ObjectId(req.params.id);
        let userDetails = await Users.aggregate([
            { $match: { _id: user_Id } },
            {
                $lookup: {
                    from: "roles",
                    let: { role_ids: "$user_Role" },
                    pipeline: [
                        { $match: { $expr: { $in: ["$_id", "$$role_ids"] } } }
                    ],
                    as: "rolesInfo"
                }
            },
            {
                $project: {
                    _id: 1,
                    user_firstName: 1,
                    user_lastName: 1,
                    user_Email: 1,
                    user_Phone: 1,
                    user_Role: 1,
                    user_Designation: 1,
                    user_status: 1,
                    created: 1,
                    updated: 1,
                    role_Names: "$rolesInfo.role_Name"
                }
            }
        ]);
        if (userDetails.length > 0) {
            userDetails[0].DoubtCount = DoubtCount;
            userDetails[0].SupplierCount = SupplierCount;
        }
        res.status(200).send(userDetails).end();
    } catch (err) {
        logError('fetchSpecificProfile', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed.");
    }
};

//User Section
exports.addUserData = async (req, res) => {
    try {
        const userData = req.body;
        const user_email = req.body.user_Email;

        const existingUserEmail = await Users.findOne({user_Email: userData.user_Email});
        if (existingUserEmail) {
            const err = new Error("Attempt to add a User with email already exists");
            logError('addUserData', err, req.user.user_ref_id);
            return res.status(500).send("User Email Already Exists.");
        }

        const existingUserPhone = await Users.findOne({user_Phone: userData.user_Phone});
        if (existingUserPhone) {
            const err = new Error("Attempt to add a User with Phone already exists");
            logError('addUserData', err, req.user.user_ref_id);
            return res.status(500).send("User Phone Already Exists.");
        }

        //New User Registration starts
        let password = randomstring.generate({length: 6, capitalization : 'uppercase'});
        let userCnt = await LoginUsers.countDocuments({ user_email }).exec();
        let userDatainfo = [];
        if (userCnt == 0) {
            userDatainfo = await Users.create(userData);
            encryptedPassword = await bcrypt.hash(password, 10);
            const login_User = await LoginUsers.create({
                user_ref_id: userDatainfo._id,
                user_email: user_email,
                password: encryptedPassword,
            });
            const token = jwt.sign({ user_id: login_User._id },
                process.env.TOKEN_KEY,
                {
                    expiresIn: "2h",
                }
            );
            login_User.token = token;
           
            //Registration Email Trigger
            let mailTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user: `${process.env.From_Email}`, pass: `${process.env.From_Email_PW}` } });
			let fullUrl = `${process.env.FullURL}`;
			let reportingPersonemail = user_email;
			let mailOptions = {
				from: `${process.env.From_Email}`,
				to: `${reportingPersonemail}`,
				cc: `${process.env.From_Email_CC}`,
				subject: `User Account Created Successfully in ENCORE CRM`,
				html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
                    <div style="background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
                        <div style="background-color: #f95c66; color: #fff; padding: 10px; border-radius: 8px 8px 0 0; text-align: center; font-size: 24px;">
                            Account Created Successfully
                        </div>
                        <div style="margin: 20px 0; font-size: 14px;">
                            <p style="line-height: 1.6; color: #333;">Hi ${reportingPersonemail},</p>
                            <p style="line-height: 1.6; color: #333;">Your account has been created successfully in the ENCORE CRM Application.</p>
                            <p style="line-height: 1.6; color: #333;">Please find your account information:</p>
                            <p style="line-height: 1.6; color: #333;"><strong>User email:</strong> ${reportingPersonemail}</p>
                            <p style="line-height: 1.6; color: #333;"><strong>User Password:</strong> ${password}</p>
                            <p style="line-height: 1.6; color: #333;">Link: <a href="${fullUrl}/login" style="color: #007BFF; text-decoration: none;">Click here to login</a></p>
                            <p style="line-height: 1.6; color: #333;">If you are facing any issues, please contact the administrator.</p>
                        </div>
                    </div>
                </div>
                `,
			};
			mailTransporter.sendMail(mailOptions, function(error, info){
				if (error) { console.log(error); }
				else { console.log('Email sent: ' + info.response); }
			});
            res.status(200).send("Data Added Successfully");
        } else {
            res.status(500).send("Email Already Registrered");
        }
        res.end();
    }
    catch (err) { 
        logError('addUserData', err, req.user.user_ref_id);
        res.status(500).send("Data Adding Failed.");
    }
}

exports.fetchUserData = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const page = parseInt(req.query.page) || 0;
        const skip = page * limit;
        const searchKeyword = req.query.query?.trim();
        
        const sortField = req.query.sortField || "user_firstName";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
        const sortObject = { [sortField]: sortOrder };

        const matchFilter = {
            user_DataRemoved: false,
        };

        if (searchKeyword) {
            const regex = new RegExp(searchKeyword, 'i');
            matchFilter.$or = [
                {
                    $expr: {
                        $regexMatch: {
                            input: { $concat: ["$user_firstName"," ", "$user_lastName"] },
                            regex: regex,
                        },
                    },
                },
                { user_firstName: { $regex: regex } },
                { user_lastName: { $regex: regex } },
                { user_Email: { $regex: regex } },
            ];
        }

        const [userDetails, total_users_count] = await Promise.all([
            Users.aggregate([
                { $match: matchFilter },
                { $sort: sortObject },
                {
                    $lookup: {
                        from: "roles",
                        localField: "user_Role",
                        foreignField: "_id",
                        as: "userroles",
                    }
                },
                {
                    $project: {
                        _id: 1,
                        user_firstName: 1,
                        user_lastName: 1,
                        user_Email: 1,
                        user_Phone: 1,
                        user_status: 1,
                        region: 1,
                        user_Designation: 1,
                        user_DataRemoved: 1,
                        user_Role: 1,
                        roleId: "$userroles._id",
                        roleName: "$userroles.role_Name",
                    }
                },
                { $skip: skip },
                { $limit: limit },
            ]),
            Users.countDocuments(matchFilter),
        ]);

        const pages = Math.ceil(total_users_count / limit);
        res.status(200).send({
            totalItems: total_users_count,
            fetchedItems: userDetails,
            rowsPerPage: limit,
            totalPages: pages,
        });
    } catch (err) {
        logError('fetchUserData', err, req.user.user_ref_id);
        res.status(500).send("Data Fetching Failed.");
    }
};

const ExcelJS = require('exceljs');

// ...existing code...

exports.exportUserData = async (req, res) => {
    try {
        const searchKeyword = req.query.query?.trim();
        
        const sortField = req.query.sortField || "user_firstName";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
        const sortObject = { [sortField]: sortOrder };

        const matchFilter = {
            user_DataRemoved: false,
        };

        if (searchKeyword) {
            const regex = new RegExp(searchKeyword, 'i');
            matchFilter.$or = [
                {
                    $expr: {
                        $regexMatch: {
                            input: { $concat: ["$user_firstName", " ", "$user_lastName"] },
                            regex: regex,
                        },
                    },
                },
                { user_firstName: { $regex: regex } },
                { user_lastName: { $regex: regex } },
                { user_Email: { $regex: regex } },
            ];
        }

        const userDetails = await Users.aggregate([
            { $match: matchFilter },
            { $sort: sortObject },
            {
                $lookup: {
                    from: "roles",
                    localField: "user_Role",
                    foreignField: "_id",
                    as: "userroles",
                }
            },
            {
                $project: {
                    _id: 1,
                    user_firstName: 1,
                    user_lastName: 1,
                    user_Email: 1,
                    user_Phone: 1,
                    user_status: 1,
                    region: 1,
                    user_Designation: 1,
                    roleName: "$userroles.role_Name",
                }
            },
        ]);

        // Create workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Encore CRM';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Users');

        // Define columns
        worksheet.columns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'First Name', key: 'firstName', width: 20 },
            { header: 'Last Name', key: 'lastName', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Designation', key: 'designation', width: 20 },
            { header: 'Region', key: 'region', width: 15 },
            { header: 'Role(s)', key: 'roles', width: 25 },
            { header: 'Status', key: 'status', width: 12 },
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'f95c66' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Add data rows
        userDetails.forEach((user, index) => {
            worksheet.addRow({
                sno: index + 1,
                firstName: user.user_firstName || '',
                lastName: user.user_lastName || '',
                email: user.user_Email || '',
                phone: user.user_Phone || '',
                designation: user.user_Designation || '',
                region: user.region || '',
                roles: Array.isArray(user.roleName) ? user.roleName.join(', ') : '',
                status: user.user_status || '',
            });
        });

        // Set response headers for file download
        const filename = `Users_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        logError('exportUserData', err, req.user.user_ref_id);
        res.status(500).send("Data Export Failed.");
    }
};

exports.fetchspecificuserdata = async (req, res) => {
    try {
      let user_Id = new mongoose.Types.ObjectId(req.params.id);
      let userDetails = await Users.aggregate([
        { $match: { _id: user_Id } },
        {
          $lookup: {
            from: "roles",
            let: { role_ids: "$user_Role" },
            pipeline: [
              { $match: { $expr: { $in: ["$_id", "$$role_ids"] } } }
            ],
            as: "rolesInfo"
          }
        },
        {
          $project: {
            _id: 1,
            user_firstName: 1,
            user_lastName: 1,
            user_Email: 1,
            user_Phone: 1,
            user_Role: 1,
            region :1,
            user_Designation: 1,
            user_status: 1,
            created: 1,
            updated: 1,
            role_Names: "$rolesInfo.role_Name" // returns an array of role names
          }
        }
      ]);
      res.status(200).send(userDetails).end();
    } catch (err) {
      logError('fetchspecificuserdata', err, req.user.user_ref_id);
      res.status(500).send("Data Fetching Failed.");
    }
};
  
exports.updatespecificuserdata = async (req, res) => {
    try {
        let user_Id = new mongoose.Types.ObjectId(req.params.id);
        const user_Data = req.body;
        user_Data.updated = new Date().toISOString();

        const existingUserEmail = await Users.findOne({user_Email: user_Data.user_Email, _id: { $ne: user_Id }});
        if (existingUserEmail) {
            const err = new Error("Attempt to update a User with a Email already exists");
            logError('addUserData', err, req.user.user_ref_id);
            return res.status(500).send("User Email Already Exists.");
        }

        const existingUserPhone = await Users.findOne({user_Phone: user_Data.user_Phone, _id: { $ne: user_Id }});
        if (existingUserPhone) {
            const err = new Error("Attempt to update a User with a Phone already exists");
            logError('addUserData', err, req.user.user_ref_id);
            return res.status(500).send("User Phone Already Exists.");
        }

        let userInfo = await Users.findByIdAndUpdate(user_Id, user_Data, attrs);
        if(userInfo){
            const conditions = { user_ref_id: user_Id };
            let updateData = { $set: { "user_email": req.body.user_Email}};
            const updatedOrderInfo = await LoginUsers.updateOne(conditions, updateData);
        }
        res.status(200).send("Data Updated Successfully");
        res.end();
    }
    catch (err) { 
        logError('updatespecificuserdata', err, req.user.user_ref_id); 
        res.status(500).send("Data Updation Failed.");
    }
}

exports.addRoleData = async (req, res) => {
    try {
        const rolesData = req.body;
        let rolesDatainfo = await Roles.create(rolesData);
        res.status(200).send(rolesDatainfo);
        res.end();
    }
    catch (err) { 
        logError('addRoleData', err, req.user.user_ref_id); 
        res.status(500).send("Data Adding Failed.");
    }
}

exports.fetchRoleDataDropdown = async (req, res) => {
    try {
        let roleDetails = await Roles.find({ role_status: "active" });
        res.send(roleDetails).status(200).end();
    }
    catch (err) { 
        logError('fetchRoleDataDropdown', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.fetchRoleData = async (req, res) => {
    try {
       
        const limit = 30;
        const page = req.query.page || 0;
        const skip = page * limit;
        const total_roles_count = await Roles.countDocuments({ role_status: "active" });

    const rolesDetails = await Roles.aggregate([
      { $match: { role_status: "active" } },
      { $sort: { role_status: 1 }},

      // Ensure depts exists as an array
      {
        $addFields: {
          depts: { $ifNull: ["$depts", []] }
        }
      },

      // Now lookup; empty array -> no matches
      {
        $lookup: {
          from: "departments",
          let: { dept_codes: "$depts" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$department_code", "$$dept_codes"] }
              }
            }
          ],
          as: "deptsInfo"
        }
      },

      { $sort: { core_Product_Order: 1 } },

      {
        $project: {
          _id: 1,
          role_Name: 1,
          role_category: 1,
          depts: 1,
          deptsInfo: 1,
          role_status: 1,
          created: 1
        }
      }
    ]).skip(skip).limit(limit);
        const pages = Math.ceil(total_roles_count / limit);
        const fullObj = {
            totalItems: total_roles_count,
            fetchedItems: rolesDetails,
            rowsPerPage: limit,
            totalPages: pages,
        };
        res.status(200).send(fullObj);
    }
    catch (err) { 
        logError('fetchRoleData', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.fetchspecificroledata = async (req, res) => {
    try {
        let role_Id = req.params.id;
        let roleDetails = await Roles.find({ _id: role_Id });
        res.send(roleDetails).status(200).end();
    }
    catch (err) { 
        logError('fetchspecificroledata', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.updateroledata = async (req, res) => {
    try {
        let role_Id = req.params.id;
        const roles_Data = req.body;
        roles_Data.updated = new Date().toISOString();
        let rolesInfo = await Roles.findByIdAndUpdate(role_Id, roles_Data, attrs);
        res.status(200).send(rolesInfo);
        res.end();
    }
    catch (err) { 
        logError('updateroledata', err, req.user.user_ref_id); 
        res.status(500).send("Data Updation Failed.");
    }
}

//Modules Section
exports.addModulesData = async (req, res) => {
    try {
        const Module_Datas = req.body;
        if(Module_Datas.modules_Name){
			Module_Datas.modules_Alias = (Module_Datas.modules_Name).replaceAll(' ', '');
		}
        let moduleDatainfo = await Modules.create(Module_Datas);
        res.status(200).send(moduleDatainfo);
        res.end();
    }
    catch (err) { 
        logError('addModulesData', err, req.user.user_ref_id); 
        res.status(500).send("Data Adding Failed.");
    }
}

exports.fetchModulesData = async (req, res) => {
    try {
        let moduleDetails = await Modules.find({ modules_Status: "active" });
        res.send(moduleDetails).status(200).end();
    }
    catch (err) { 
        logError('fetchModulesData', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.fetchspecificmodulesdata = async (req, res) => {
    try {
        let modules_Id = req.params.id;
        let modulesDetails = await Modules.find({ _id: modules_Id });
        res.send(modulesDetails).status(200).end();
    }
    catch (err) { 
        logError('fetchspecificmodulesdata', err, req.user.user_ref_id); 
        res.status(500).send("Data Fetching Failed.");
    }
}

exports.updatespecificmodulesdata = async (req, res) => {
    try {
        let modules_Id = req.params.id;
        const modules_Data = req.body;
        if(modules_Data.modules_Name){
			modules_Data.modules_Alias = (modules_Data.modules_Name).replaceAll(' ', '');
		}
        modules_Data.updated = new Date().toISOString();
        let modulesInfo = await Modules.findByIdAndUpdate(modules_Id, modules_Data, attrs);
        res.status(200).send(modulesInfo);
        res.end();
    }
    catch (err) { 
        logError('updatespecificmodulesdata', err, req.user.user_ref_id); 
        res.status(500).send("Data Updation Failed.");
    }
}

exports.addRolePermissionData = async(request, response) =>{
    try{
        const permissionDatas = request.body;
		let role_id = request.params.id;
		
		let activeModules = await Modules.find();
		if(activeModules.length > 0){
			let roleModuleObj = {};
			for(i=0;i<activeModules.length;i++){				
				let rolepermsinfo = await RolesPermission.create({
					Role_Id : role_id,
					Module_Id : activeModules[i]._id,
					Add_Perms : "0",
					Edit_Perms : "0",
					View_Perms : "0",
					created : new Date().toISOString(),
				});
			}
		}
		
		for (const key of Object.keys(permissionDatas)) {
			let add = 0, edit = 0, view = 0;
			if(permissionDatas[key].includes('add')){ add = 1;};
			if(permissionDatas[key].includes('edit')){ edit = 1;};
			if(permissionDatas[key].includes('view')){ view = 1;};
		  
			let rolepermsinfo = await RolesPermission.findOneAndUpdate({Role_Id: role_id, Module_Id: key}, {
				Add_Perms : add,
				Edit_Perms : edit,
				View_Perms : view,
			});
		}
		
		response.send("Roles Added Succesfully").status(200).end();
    }
    catch(err){ 
        logError('addRolePermissionData', err, request.user.user_ref_id); 
        response.status(500).send("Data Adding Failed.");
    }
}

exports.fetchRolePermissionData = async (request,response) => {
    try{
        let Role_Id = request.params.id; 
        let RolePermissionDetails = await RolesPermission.find({Role_Id: Role_Id});
        
		let responseObj = {};
		if(RolePermissionDetails.length > 0){
			for(k=0;k<RolePermissionDetails.length;k++){
				
				let permissionArr = [];
				if(RolePermissionDetails[k].Add_Perms == "1"){
					permissionArr.push("add");
				}
				if(RolePermissionDetails[k].Edit_Perms == "1"){
					permissionArr.push("edit");
				}
				if(RolePermissionDetails[k].View_Perms == "1"){
					permissionArr.push("view");
				}
				responseObj[RolePermissionDetails[k].Module_Id] = permissionArr;
			}
		}
        response.send(responseObj).status(200).end();
    }
    catch(err){
        logError('fetchRolePermissionData', err, request.user.user_ref_id);
        response.status(500).send("Data Fetching Failed.");
    }
}

exports.updateRolePermissionData = async(request, response) =>{
    try{
        const permissionDatas = request.body;
		let role_id = request.params.id;

		for (const key of Object.keys(permissionDatas)) {
		  let add = 0, edit = 0, view = 0;
		  if(permissionDatas[key].includes('add')){ add = 1;};
		  if(permissionDatas[key].includes('edit')){ edit = 1;};
		  if(permissionDatas[key].includes('view')){ view = 1;};
		  
		  let rolepermsinfo = await RolesPermission.findOneAndUpdate({Role_Id: role_id, Module_Id: key}, {
			 Add_Perms : add,
			 Edit_Perms : edit,
			 View_Perms : view,
		  }).exec();
		  
			if(!rolepermsinfo){
				let rolepermsinfo = await RolesPermission.create({
					Role_Id : role_id,
					Module_Id : key,
					Add_Perms : add,
					Edit_Perms : edit,
					View_Perms : view,
					created : new Date().toISOString(),
				});
			}
		  
		}
		response.send("Role Permissions updated successfully").status(200).end();
    }
    catch(err){ 
        logError('updateRolePermissionData', err, request.user.user_ref_id); 
        response.status(500).send("Data Updation Failed.");
    }
}

function randomString() {
	let length = 8;
    const characters = process.env.PW_CH_SEC_Token; // characters used in string
    let result = ''; // initialize the result variable passed out of the function
    for (let i = length; i > 0; i--) {
        result += characters[Math.floor(Math.random() * characters.length)];
    }
    return result;
}

exports.fetchSuspeciousLogins = async (req, res) =>{
     try {
        const pipline = [
            { $match : {
                isSuspicious: true, reviewed: false
                }
            },
            {
                $lookup: {
                    from: 'users',
                    let: { userId: "$user_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
                        { $project: { _id: 1, user_Email: 1, region: 1  } }
                    ],
                    as: 'users'
                }
            },
            {
                $unwind: {
                    path: '$users',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id:1,
                    users: '$users',
                    login_time: 1,
                    reason: 1,
                    location: 1
                }
            }
        ];
        const logs = await LoginLogs.aggregate(pipline)


        res.status(200).json({
            status: true,
            message: 'Logs fetched successfully',
            data: logs,
        });
    } catch (error) {
        handleMongooseError(error, res);
    }
}

exports.updateSuspeciousLogins = async (req, res) =>{
    try {
        const { id } = req.params
        const updateLogs = await LoginLogs.findByIdAndUpdate(id, { reviewed: true, reviewed_by: req.user.user_ref_id })

        if(!updateLogs){
            return res.status(404).json({
                status: false,
                message: 'Record not found',
            });
        }

        res.status(200).json({
            status: true,
            message: 'Marked as reviewed',
        });
    } catch (error) {
        handleMongooseError(error, res);
    }
}

exports.userLogout = async (req, res) => {
     // Clear all cookies
  res.setHeader("Set-Cookie", [
    "token=; HttpOnly; Path=/; Max-Age=0;",
    "session=; HttpOnly; Path=/; Max-Age=0;",
  ]);

  // Strongest browser cleanup
  res.setHeader("Clear-Site-Data", '"cache", "cookies", "storage"');

  res.json({ status: true, message: "Logged out & cache cleared" });
};