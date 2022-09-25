// const nodemailer = require('nodemailer');
// const { google } = require('googleapis')
// const CLIENT_ID = '287750662137-8l43rsp5hkhm5nv1bj6s1hp9bqt1rhiu.apps.googleusercontent.com';
// const CLEINT_SECRET = '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';
// const REDIRECT_URI = 'https://developers.google.com/oauthplayground';
// const REFRESH_TOKEN = '1//04wrQc6fUVVXdCgYIARAAGAQSNwF-L9IrbujiHLIdNaQFM8KPWrkCcf48hN6H4JV2EFq07l8HLUwtqfenU-Fbjxo7zImVoFNAC3M';

// const oAuth2Client = new google.auth.OAuth2(
//   CLIENT_ID,
//   CLEINT_SECRET,
//   REDIRECT_URI
// );
// oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// async function sendMail() {
//   try {
//     const accessToken = await oAuth2Client.getAccessToken();

//     const transport = nodemailer.createTransport({
//       service: 'gmail',
//       auth: {
//         type: 'OAuth2',
//         user: 'noreply.letmeauth@gmail.com',
//         clientId: CLIENT_ID,
//         clientSecret: CLEINT_SECRET,
//         refreshToken: REFRESH_TOKEN,
//         accessToken: accessToken,
//       },
//     });

//     const mailOptions = {
//       from: 'Let Me Auth <yours authorised email noreply.letmeauth@gmail.com>',
//       to: 'tranthanhduy655@gmail.com',
//       subject: 'Hello from gmail using API',
//       text: 'Hello from gmail email using API',
//       html: '<br>Alo</br>',
//     };

//     const result = await transport.sendMail(mailOptions);
//     return result;
//   } catch (error) {
//     return error;
//   }
// }

// sendMail()
//   .then((result) => console.log('Email sent...', result))
//   .catch((error) => console.log(error.message));