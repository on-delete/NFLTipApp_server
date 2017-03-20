var mysql = require('mysql');
var winston = require('winston');

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)(),
        new (winston.transports.File)({
            name: 'serverlog-info',
            filename: 'serverlog-info.log',
            level: 'info',
            json: true,
            timestamp: true
        }),
        new (winston.transports.File)({
            name: 'serverlog-error',
            filename: 'serverlog-error.log',
            level: 'error',
            json: true,
            timestamp: true
        })
    ]
});

var exports = module.exports;

exports.pool = mysql.createPool({
    host: 'localhost',
    user: 'andredb',
    password: 'database123',
    database: 'nfltipappdb'
});

exports.sendResponse = function sendResponse(res, resp, connection, statusCode) {
    res.status(statusCode).end(JSON.stringify(resp));
    if (connection !== null) {
        connection.destroy();
    }
};

exports.sendError = function (resp, errMsg, res, connection) {
    resp.result = "failed";
    resp.message = errMsg;
    sendResponse(res, resp, connection, 500);
};

exports.handleError = function (functionNamne, err) {
    logger.error('Error in function ' + functionNamne);
    logger.error('Error message: ' + err.message);
};

exports.handleInfo = function (infoMessage) {
    logger.info(infoMessage);
};
