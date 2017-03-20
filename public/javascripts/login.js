var utils = require('./utils');
var mysql = require('mysql');
var bcrypt = require('bcrypt-nodejs');

var exports = module.exports;

exports.loginUser = function (req, res) {
    var resp = {
        "result": "",
        "message": "",
        "userid": ""
    };
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('loginUser - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql = "SELECT user_password, user_id FROM user WHERE user_name = ?";
            var inserts = [req.body.name];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('loginUser - select query from user', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    if (rows[0] !== undefined) {
                        var password = rows[0].user_password;

                        bcrypt.compare(req.body.password, password, function (err, result) {
                            if (err) {
                                utils.handleError('loginUser - bcrypt.compare', err);
                                resp.result = "failed";
                                resp.message = "internal error";
                                utils.sendResponse(res, resp, connection, 500);
                            }
                            else {
                                if (result) {
                                    resp.result = "success";
                                    resp.message = "login_successfull";
                                    resp.userid = rows[0].user_id;
                                }
                                else {
                                    resp.result = "success";
                                    resp.message = "password_wrong";
                                }
                                utils.sendResponse(res, resp, connection, 200);
                            }
                        });
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
};