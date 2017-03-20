var utils = require('./utils');
var mysql = require('mysql');
var winston = require('winston');

var exports = module.exports;

exports.updatePrediction = function (req, res) {
    var resp = {
        "result": "",
        "message": ""
    };
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('updatePrediction - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql;
            var inserts;
            if (req.body.hasPredicted) {
                sql = "UPDATE predictions SET predicted=1, home_team_predicted=? where game_id=? and user_id=?;";
                inserts = [(req.body.hasHomeTeamPredicted ? 1 : 0), req.body.gameId, req.body.userId];
            }
            else {
                sql = "UPDATE predictions SET predicted=0, home_team_predicted=0 where game_id=? and user_id=?;";
                inserts = [req.body.gameId, req.body.userId];
            }
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err) {
                if (err) {
                    utils.handleError('updatePrediction - update query predictions', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    resp.result = "success";
                    resp.message = "prediction_updated";
                    utils.sendResponse(res, resp, connection, 200);
                }
            });
        }
    });
};

exports.updatePredictionPlus = function (req, res) {
    var resp = {
        "result": "",
        "message": ""
    };
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('updatePredictionPlus - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql;
            var inserts;
            var teamPrefix = req.body.teamprefix;

            if (teamPrefix !== "") {
                sql = "UPDATE predictions_plus " +
                    "JOIN teams " +
                    "ON ? = teams.team_prefix " +
                    "SET ?? = teams.team_id " +
                    "WHERE user_id = ?;";
                inserts = [teamPrefix, req.body.predictionType, req.body.userId];
            }
            else {
                sql = "UPDATE predictions_plus " +
                    "SET ?? = NULL " +
                    "WHERE user_id = ?;";
                inserts = [req.body.predictionType, req.body.userId];
            }
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err) {
                if (err) {
                    utils.handleError('updatePredictionPlus - update query predictions_plus', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    resp.result = "success";
                    resp.message = "predictionplus_updated";
                    utils.sendResponse(res, resp, connection, 200);
                }
            });
        }
    });
};
