var nodemailer = require('nodemailer');
var SmartHash = require('smarthash').SmartHash;
var passwordTable = new SmartHash();
var utils = require('./utils');
var mysql = require('mysql');

var exports = module.exports;

var transporter = nodemailer.createTransport({
   service: 'gmail',
    auth: {
       user: 'nfltipapp@gmail.com',
        pass: 'abitur200915'
    }
   //  host: 'smtp.rocciberge.de',
   //  port: 587,
   //  secure: false,
   //  auth: {
   //      user: 'nfltipappmail@rocciberge.de',
   //      pass: '123abc'
   //  },
   //  tls: {
   //      rejectUnauthorized: false
   //  }
});
//     host: 'rocciberge.de',
//     port: 465,
//     secure: true, // secure:true for port 465, secure:false for port 587
//     auth: {
//         user: 'nfltipapp@rocciberge.de',
//         pass: 'abitur200915'
//     },
//     debug: true,
//     tls: {rejectUnauthorized: false}
// }, {
//     from: 'NFLTipApp <noreply@rocciberge.de>'
// }


exports.recoveryPassword = function(req, res) {
    getUserIdAndEmail(req, res);
};

function getUserIdAndEmail(req, res) {
    var resp = {
        "email": "",
        "result": "",
        "message": ""
    };

    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('sendEmail - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql = "SELECT user_email, user_id FROM user WHERE user_name = ?";
            var inserts = [req.body.name];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('sendEmail - select query from user', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    if (rows[0] !== undefined) {
                        var email = rows[0].user_email;
                        var userId = rows[0].user_id;

                        createLink(res, resp, email, userId);
                    }
                    else {
                        resp.result = "success";
                        resp.message = "user_not_found";
                        utils.sendResponse(res, resp, connection, 200);
                    }
                }
            });
        }
    });
}

function createLink(res, resp, email, userId) {
    var replaceRequestId = false;

    passwordTable.checkIfIndexExist({index: userId}, function (err, result) {
        if (result) {
            replaceRequestId = true;
        }
    });

    if(replaceRequestId) {
        exports.deleteSessionEntry(userId);
    }

    var requestId = insertRequestId(userId, "wieder einfügen");

    resp.email = email;
    resp.result = "success";
    resp.message = "request_created";
    utils.sendResponse(res, resp, null, 200);

    sendEmail(email, requestId);
}

function insertRequestId(userId, debug) {
    var requestId = getRandomArbitrary(1000, 999999);
    passwordTable.insert({index: userId, value: {requestId: requestId}, ttl: 30, time: 'm'});
    return requestId;
}

function getRandomArbitrary(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

function sendEmail(email, requestId) {
    transporter.sendMail(createEmailConfig(email, requestId), function (error, info) {
             if (error) {
                 return console.log(error);
             }
             console.log("Passwort zuruecksetzen angefordert");
             console.log("Message gesendet an "+ email);
         });
}

function createEmailConfig(email, requestId) {
    return {
        to: email,
        subject: 'NFLTipApp: Passwort zurücksetzen',
        text: 'Um dein Passwort zurückzusetzen, öffne folgenden Link: \n https://www.rocciberge.de:3000/resetPassword?requestId=' + requestId
    };
}

exports.renderWebsite = function (req, res) {
  var requestId = req.query.requestId;
  var info = {
      "userId": "",
      "requestId": ""
  };

  var data = passwordTable.Data;

  Object.keys(data).forEach(function(key) {
      if(data[key].value.requestId == requestId){
          info.userId = key;
          info.requestId = data[key].value.requestId;
      }
  });

  if(info.requestId === ""){
      res.render('passwordErrorForm');
  } else {
      res.render('passwordForm', {userId: info.userId, requestId: info.requestId});
  }
};

exports.deleteSessionEntry = function (userId) {
    passwordTable.remove({index: userId}, function (err, result) {
        //nothing to do, just to prevent multiple entries
    });
};