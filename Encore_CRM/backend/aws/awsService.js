// const nodemailer = require('nodemailer');
// const AWS = require('aws-sdk');
// const { ses, s3 } = require('../aws/awsConfig');
// const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
// const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// const s3Client = new S3Client({ region: process.env.AWS_REGION });

// /**
//  * Function to get signed URLs for attachments stored in S3
//  */
// const getS3Attachments = async (fileNames, bucketName) => {
//     const signedUrlsPromises = fileNames.map(async (fileName) => {
//         const command = new GetObjectCommand({
//             Bucket: bucketName,
//             Key: fileName,
//         });
//         const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

//         return { filename: fileName, path: url };
//     });

//     return await Promise.all(signedUrlsPromises);
// };

// /**
//  * Method 1: Sending email using Nodemailer
//  */
// const sendEmailWithNodemailer = async (to, subject, text, attachments, retries = 3) => {
//     const transporter = nodemailer.createTransport({
//         SES: { ses, aws: AWS },
//     });

//     const mailOptions = {
//         from: process.env.AWS_SES_FROM_EMAIL,
//         to,
//         subject,
//         text,
//         attachments,
//     };

//     for (let attempt = 0; attempt < retries; attempt++) {
//         try {
//             let result = await transporter.sendMail(mailOptions);
//             console.log(`Email sent successfully via Nodemailer: ${result.messageId}`);
            
//             // Return status 1 if sent successfully
//             return { status: 1, result };
//         } catch (error) {
//             console.error(`Attempt ${attempt + 1} - Nodemailer Error:`, error);
//             if (attempt === retries - 1) {
//                 return { status: 2, error }; // Return status 2 if all retries fail
//             }
//         }
//     }
// };


// /**
//  * Method 2: Sending email using AWS SES API (sendRawEmail)
//  */
// const sendEmailWithSESAPI = async (to, subject, text, attachments, retries = 3) => {
//     // const attachments = await getS3Attachments(fileNames, 'encore-sheet');

//     // Create MIME message
//     const boundary = `----ses-email-boundary-${Date.now()}`;
//     let rawMessage = `
//         From: ${process.env.AWS_SES_FROM_EMAIL}
//         To: ${to}
//         Subject: ${subject}
//         MIME-Version: 1.0
//         Content-Type: multipart/mixed; boundary="${boundary}"
        
//         --${boundary}
//         Content-Type: text/plain; charset="UTF-8"
//         Content-Transfer-Encoding: 7bit
        
//         ${text}
//     `;

//     // Fetch attachments and encode in Base64
//     for (const attachment of attachments) {
//         const response = await fetch(attachment.path);
//         const buffer = await response.arrayBuffer();
//         const base64Data = Buffer.from(buffer).toString('base64');

//         rawMessage += `
//             --${boundary}
//             Content-Type: application/octet-stream; name="${attachment.filename}"
//             Content-Transfer-Encoding: base64
//             Content-Disposition: attachment; filename="${attachment.filename}"
            
//             ${base64Data}
//         `;
//     }

//     rawMessage += `\n--${boundary}--`;

//     const params = {
//         RawMessage: { Data: Buffer.from(rawMessage) },
//         Source: process.env.SENDER_EMAIL,
//         Destinations: [to],
//     };

//     for (let attempt = 0; attempt < retries; attempt++) {
//         try {
//             let result = await ses.sendRawEmail(params).promise();
//             console.log(`Email sent successfully via SES API: ${result.MessageId}`);
//             return result;
//         } catch (error) {
//             console.error(`Attempt ${attempt + 1} - SES API Error:`, error);
//             if (attempt === retries - 1) throw error; // Rethrow after max retries
//         }
//     }
// };

// module.exports = { sendEmailWithNodemailer, sendEmailWithSESAPI };
