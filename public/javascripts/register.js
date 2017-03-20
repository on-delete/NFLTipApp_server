var utils = require('./utils');
var mysql = require('mysql');
var bcrypt = require('bcrypt-nodejs');
var winston = require('winston');

var exports = module.exports;

exports.nameExisting = function (req, res) {
    var resp = {
        "result": "",
        "message": ""
    };

    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('nameExisting - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql = "SELECT user_name FROM user WHERE user_name = ?";
            var inserts = [req.body.name];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('nameExisting - select query from user', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    resp.result = "success";
                    if (rows.length > 0) {
                        resp.message = "username_already_used";
                    }
                    else {
                        resp.message = "username_unused";
                    }
                    utils.sendResponse(res, resp, connection, 200);
                }
            });
        }
    });
};

exports.registerUser = function (req, res) {
    var resp = {
        "result": "",
        "message": ""
    };

    bcrypt.hash(req.body.user.password, null, null, function (err, hash) {
        if (err) {
            utils.handleError('registerUser - bcrypt.hash', err);
            utils.sendError(resp, err.message, res, null);
        }
        else {
            var passwordHash = hash;

            utils.pool.getConnection(function (err, connection) {
                if (err) {
                    utils.handleError('registerUser - poolConnection', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    var sql = "INSERT INTO user (user_name, user_email, user_password) VALUES (?, ?, ?)";
                    var inserts = [req.body.user.name, req.body.user.email, passwordHash];
                    sql = mysql.format(sql, inserts);
                    connection.query(sql, function (err, result) {
                        if (err) {
                            utils.handleError('registerUser - insert query user', err);
                            resp.result = "failed";
                            resp.message = err.message;
                            utils.sendResponse(res, resp, connection, 500);
                        }
                        else {
                            resp.result = "success";
                            resp.message = "user_registered";
                            initPredictionsForNewUser(res, resp, result.insertId, connection, 200);
                        }
                    });
                }
            });
        }
    });
};

function initPredictionsForNewUser(res, resp, userId, connection) {
    var sql = "INSERT INTO predictions (game_id, predicted, home_team_predicted, user_id) select game_id, 'false', 'NULL', ? from games;";
    var inserts = [userId];
    sql = mysql.format(sql, inserts);
    connection.query(sql, function (err) {
        if (err) {
            utils.handleError('initPredictionsForNewUser - insert query predictions', err);
            utils.sendError(resp, err.message, res, connection, 500);
        }
        else {
            initPredictionsPlusForNewUser(res, resp, userId, connection);
        }
    });
}

function initPredictionsPlusForNewUser(res, resp, userId, connection) {
    var sql = "INSERT INTO predictions_plus (user_id, superbowl, afc_winner, nfc_winner, best_offense, best_defense) VALUES (?, NULL, NULL, NULL, NULL, NULL);";
    var inserts = [userId];
    sql = mysql.format(sql, inserts);
    connection.query(sql, function (err) {
        if (err) {
            utils.handleError('initPredictionsPlusForNewUser - insert query predictions_plus', err);
            utils.sendError(resp, err.message, res, connection, 500);
        }
        else {
            utils.sendResponse(res, resp, connection, 200);
        }
    });
}
