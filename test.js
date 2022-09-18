const nodemailer = require('nodemailer')
function sendMail() {
    const transport = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: '587',
        auth: {
            user: 'duyne@duynecodedao.xyz',
            pass: 'Thanhduy@1980'
        }
        // auth: {
        //     user: "noreply.letmeauth@gmail.com",
        //     pass: "Letmeauth@2022noreply"
        // }
    }); 
    const options = transport.sendMail({
        from: 'duyne@duynecodedao.xyz',
        to: 'tranthanhduy655@gmail.com',
        subject: 'Hello :3',
        text: 'Hello'
    })
    transport.sendMail(options, function(err, info) {
        if(err) {
            console.log(err);
            return;
        }
        console.log(info.response)
    })
}
sendMail()