const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const Users = require('../models/userModel');
const nodemailer = require('nodemailer');
const LoginUsers = require('../models/loginModel');
const schedule = require('node-schedule');
const CryptoJS = require("crypto-js");
const jwt = require("jsonwebtoken");
const { getEmpRolesAndPermissions } = require('./common');

const otpAuthentication = async (user) => {
  try {
    // Generate a secret key for 2FA
    if (user.user_secretkey === "") {
      // If no secret is present, initiate 2FA setup.
      const secret = speakeasy.generateSecret({
        length: 20,
        name: `ENCORE:${user.user_Email}`,
        issuer: 'ENCORE',
      });
      user.user_secretkey = secret.base32;
      await user.save();

      // Generate QR code
      const otpAuthUrl = secret.otpauth_url;
      const qrCodeDataURL = await QRCode.toDataURL(otpAuthUrl);

      // Respond with a prompt for the user to set up 2FA.
      return {
        key: false,
        message: 'Please scan the following QR code with your authenticator app.',
        qrCodeDataURL,
        secret: secret.base32,
        is2FARegistered: user.is2FARegistered
      };
    }
    return {
      key: true,
      is2FARegistered: user.is2FARegistered
    };
  } catch (error) {
    console.log("err", error);
  }
};


const verifyAuth = async (req, res) => {
  try {
    // Verify the token using speakeasy
    const encryptionKey = process.env.ENCRYPTION_KEY; 
    const tokenKey = process.env.TOKEN_KEY;
    const { user_email, token_code } = req.body
    let decryptedEmail = CryptoJS.AES.decrypt(user_email, encryptionKey).toString(CryptoJS.enc.Utf8);
    let specificUser = await Users.findOne({ user_Email: decryptedEmail, user_status: "active" });

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: specificUser.user_secretkey,
      encoding: 'base32',
      token: token_code,
      window: 1
    });

    if (!verified) {
      return res.status(401).send('Invalid token.');
    }

    const login_user = await LoginUsers.findOne({ user_ref_id: specificUser._id, login_status: true });

    if (!login_user || !login_user.login_status) {
      const expire_date_time = new Date(new Date().getTime() + process.env.TWO_FACTOR_EXPIRE_TIME * 60 * 60 * 1000).toISOString();
      await LoginUsers.findOneAndUpdate(
      { user_ref_id: specificUser._id },
      { login_status: true, expire_date_time: expire_date_time }
      ).exec();
    } else {
      // Check if the current login session has expired
      const currentTime = new Date();
      const expirationTime = new Date(login_user.expire_date_time);
      
      if (currentTime > expirationTime) {
      // Session has expired, update login status
      await LoginUsers.findOneAndUpdate(
        { user_ref_id: specificUser._id },
        { login_status: false, expire_date_time: "" }
      ).exec();
      console.log(`Login session expired for user: ${specificUser._id}`);
      return res.status(401).send('Login session expired. Please log in again.');
      }
    }

    // Mark 2FA as registered if not already set
    if (!specificUser.is2FARegistered) {
      specificUser.is2FARegistered = true;
      await specificUser.save();
    }

    const userId = new mongoose.Types.ObjectId(specificUser._id);
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
    let user = await LoginUsers.findOne({ user_email: decryptedEmail });
    let responseObj = await getEmpRolesAndPermissions(user.user_ref_id);
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
    user.token = token;
    responseObj.depts = Array.isArray(userDept.depts) ? userDept?.depts : []
    responseObj.login = user;
    responseObj.constants = constants
    responseObj.message = "2FA verified successfully"

    res.status(200).json(responseObj);
  } catch (error) {
    console.log("Error", error)
  }
}

// I need to see the cron job task running and their expiration time in the console log

const regenerated2FA = async (req, res) => {
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY; // Ensure this is set in env
    let decryptedEmail = CryptoJS.AES.decrypt(req.body.user_email, encryptionKey).toString(CryptoJS.enc.Utf8);

    let specificUser = await Users.find({ user_Email: decryptedEmail, user_status: "active" });
    specificUser[0].user_secretkey = "";
    specificUser[0].is2FARegistered = false;
    await specificUser[0].save();

    const { qrCodeDataURL, message } = await otpAuthentication(specificUser[0])
    // const base64Data = qrCodeDataURL.split(',')[1];

    // var mailTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user: `${process.env.From_Email}`, pass: `${process.env.From_Email_PW}` } });
    // var fullUrl = `${process.env.FullURL}`;
    // let reportingPersonemail = user_email;
    // var mailOptions = {
    //   from: `${process.env.From_Email}`,
    //   to: `${reportingPersonemail}`,
    //   cc: `${process.env.From_Email_CC}`,
    //   subject: `User 2FA Reset Email`,
    //   html: `
    //             <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
    //                 <div style="background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
    //                     <div style="background-color: #f95c66; color: #fff; padding: 10px; border-radius: 8px 8px 0 0; text-align: center; font-size: 24px;">
    //                         Account 2FA Reset Successful
    //                     </div>
    //                     <div style="margin: 20px 0; font-size: 14px;">
    //                         <p style="line-height: 1.6; color: #333;">Hi ${reportingPersonemail},</p>
    //                         <p style="line-height: 1.6; color: #333;">Your account's 2FA has been regenerated successfully in the ENCORE CRM Application.</p>
    //                         <p style="line-height: 1.6; color: #333;">Please find your new secret key information:</p>
    //                         <p style="line-height: 1.6; color: #333;"><strong>${message}</strong></p>
    //                         <img src="cid:qrCodeImage" alt="QR Code" style="width:200px;height:200px;" />
    //                         <p style="line-height: 1.6; color: #333;">Secure the secret key<strong> : ${secret}</strong> for future use <br> If you cannot scan the QR code, use the above secret key</p>
    //                         <p style="line-height: 1.6; color: #333;">Link: <a href="${fullUrl}/login" style="color: #007BFF; text-decoration: none;">Click here to login</a></p>
    //                         <p style="line-height: 1.6; color: #333;">If you are facing any issues, please contact the administrator.</p>
    //                     </div>
    //                 </div>
    //             </div>
    //             `,
    //   attachments: [
    //     {
    //       filename: 'qrcode.png',
    //       content: Buffer.from(base64Data, 'base64'),
    //       cid: 'qrCodeImage' // Same cid as referenced in the img src
    //     }
    //   ]
    // };
    // await mailTransporter.sendMail(mailOptions).then((res) => console.log("res", res)).catch((err) => console.log("err", err));

    res.status(200).json({
      qrCodeDataURL,
      message: `2FA successfully regenerated. ${message}`})
  } catch (err) {
    console.log("error in fetching details", err)
  }
}


module.exports = { otpAuthentication, verifyAuth, regenerated2FA };