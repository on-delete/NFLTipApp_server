var utils = require('./utils');
var mysql = require('mysql');
var winston = require('winston');

var exports = module.exports;

exports.getData = function (req, res) {
    var data = {
        "ranking": "",
        "predictionsForWeeks": "",
        "predictionBeforeSeason": "",
        "standings": ""
    };

    var resp = {
        "result": "",
        "message": "",
        "data": data
    };

    calculateRanking(res, resp, req.body.userId);
};

function calculateRanking(res, resp, uuid) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('calcualateRanking - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(resp, res, connection, 500);
        }
        else {
            var sql = "SELECT user_name, user_id FROM user WHERE user_id <> 3;";
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('calcualateRanking - select query from user', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(resp, res, connection, 500);
                }
                else {
                    if (rows !== undefined) {
                        var rankingList = [];
                        var i = -1;
                        (function calculateForEveryUser(rankingList) {
                            i++;
                            if (i >= rows.length) {
                                connection.release();
                                rankingList = rankingList.sort(function (a, b) {
                                    return b.points - a.points;
                                });
                                resp.data.ranking = rankingList;
                                getPredictions(resp, res, connection, uuid);
                            }
                            else {
                                var user_name = rows[i].user_name;
                                var user_id = rows[i].user_id;
                                var sql = "SELECT predictions.home_team_predicted as home_team_predicted, games.home_team_score as home_team_score, games.away_team_score as away_team_score, games.game_finished as finished, predictions.predicted as predicted " +
                                    "FROM predictions " +
                                    "RIGHT JOIN user " +
                                    "ON user.user_id = predictions.user_id " +
                                    "RIGHT JOIN games " +
                                    "ON predictions.game_id = games.game_id " +
                                    "WHERE predictions.user_id = ? AND games.game_finished = true AND predicted = true;";
                                var inserts = [user_id];
                                sql = mysql.format(sql, inserts);
                                connection.query(sql, function (err, rows2) {
                                    if (err) {
                                        utils.handleError('calcualateRanking - select query from predictions', err);
                                        resp.result = "failed";
                                        resp.message = err.message;
                                        utils.sendResponse(resp, res, connection, 500);
                                    }
                                    else {
                                        if (rows2 !== undefined) {
                                            var j = -1;
                                            var score = 0;
                                            (function calculateRankingForUser(score) {
                                                j++;
                                                if (j >= rows2.length) {
                                                    (function () {
                                                        var sql = "SELECT predictions_plus.user_id as userid, superbowl_team.team_prefix as superbowl, afc_winner_team.team_prefix as afc_winner, nfc_winner_team.team_prefix as nfc_winner, best_offense_team.team_prefix as best_offense, best_defense_team.team_prefix as best_defense " +
                                                            "FROM predictions_plus " +
                                                            "LEFT OUTER JOIN teams as superbowl_team ON superbowl = superbowl_team.team_id " +
                                                            "LEFT OUTER JOIN teams as afc_winner_team ON afc_winner = afc_winner_team.team_id " +
                                                            "LEFT OUTER JOIN teams as nfc_winner_team ON nfc_winner = nfc_winner_team.team_id " +
                                                            "LEFT OUTER JOIN teams as best_offense_team ON best_offense = best_offense_team.team_id " +
                                                            "LEFT OUTER JOIN teams as best_defense_team ON best_defense = best_defense_team.team_id " +
                                                            "WHERE predictions_plus.user_id = ? OR predictions_plus.user_id = 3;";
                                                        var inserts = [rows[i].user_id];
                                                        sql = mysql.format(sql, inserts);
                                                        connection.query(sql, function (err, result) {
                                                            if (err) {
                                                                utils.handleError('calcualateRanking - select query from predictions_plus', err);
                                                                resp.result = "failed";
                                                                resp.message = err.message;
                                                                utils.sendResponse(resp, res, connection, 500);
                                                            }
                                                            else {
                                                                if (result !== undefined) {
                                                                    if (result[0].userid == 3) {
                                                                        defaultRow = result[0];
                                                                        userRow = result[1];
                                                                    } else {
                                                                        defaultRow = result[1];
                                                                        userRow = result[0];
                                                                    }

                                                                    if (userRow.superbowl !== null && defaultRow.superbowl !== null && userRow.superbowl === defaultRow.superbowl) {
                                                                        score += 2;
                                                                    }
                                                                    if (userRow.afc_winner !== null && defaultRow.afc_winner !== null && userRow.afc_winner === defaultRow.afc_winner) {
                                                                        score += 2;
                                                                    }
                                                                    if (userRow.nfc_winner !== null && defaultRow.nfc_winner !== null && userRow.nfc_winner === defaultRow.nfc_winner) {
                                                                        score += 2;
                                                                    }
                                                                    if (userRow.best_offense !== null && defaultRow.best_offense !== null && userRow.best_offense === defaultRow.best_offense) {
                                                                        score += 2;
                                                                    }
                                                                    if (userRow.best_defense !== null && defaultRow.best_defense !== null && userRow.best_defense === defaultRow.best_defense) {
                                                                        score += 2;
                                                                    }

                                                                    rankingList.push({
                                                                        "name": user_name,
                                                                        "userid": user_id,
                                                                        "points": score
                                                                    });
                                                                }
                                                                calculateForEveryUser(rankingList);
                                                            }
                                                        });
                                                    })();
                                                }
                                                else {
                                                    var home_team_score = rows2[j].home_team_score;
                                                    var away_team_score = rows2[j].away_team_score;
                                                    var home_team_predicted = rows2[j].home_team_predicted;
                                                    if ((home_team_score > away_team_score && home_team_predicted === 1) || (home_team_score < away_team_score && home_team_predicted === 0)) {
                                                        score += 1;
                                                    }
                                                    calculateRankingForUser(score);
                                                }

                                            })(score);
                                        }
                                        else {
                                            resp.data.ranking = [];
                                            getPredictions(resp, res, connection, uuid);
                                        }
                                    }
                                });
                            }
                        })(rankingList);
                    }
                    else {
                        resp.data.ranking = [];
                        getPredictions(resp, res, connection, uuid);
                    }
                }
            });
        }
    });
}

function getPredictions(resp, res, connection, uuid) {
    var sql = "SELECT predictions.game_id as game_id, predictions.predicted as predicted, predictions.home_team_predicted as home_team_predicted, games.game_finished as game_finished, games.home_team_score as home_team_score, games.away_team_score as away_team_score, DATE_FORMAT(games.game_datetime, \"%Y-%m-%d %T\") as game_datetime, games.season_type as season_type, games.week as week, teams_home.team_prefix as home_team_prefix, teams_away.team_prefix as away_team_prefix " +
        "FROM predictions " +
        "RIGHT JOIN games " +
        "ON predictions.game_id = games.game_id " +
        "Right JOIN teams as teams_home " +
        "ON games.home_team_id = teams_home.team_id " +
        "RIGHT JOIN teams as teams_away " +
        "ON games.away_team_id = teams_away.team_id " +
        "WHERE predictions.user_id = ? " +
        "ORDER BY game_id;";
    var inserts = [uuid];
    sql = mysql.format(sql, inserts);
    connection.query(sql, function (err, rows) {
        if (err) {
            utils.handleError('getPredictions - select query from predictions', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(resp, res, connection, 500);
        }
        else {
            if (rows !== undefined) {
                var predictionsList = [];
                for (var i = 0; i < rows.length; i++) {
                    var actualRow = rows[i];
                    var predictionListItem = getPredictionListItem(predictionsList, actualRow.week, actualRow.season_type);
                    if (predictionListItem.length === 0) {
                        var tempItem = {"week": actualRow.week, "type": actualRow.season_type, "gamePredictions": []};
                        tempItem.gamePredictions.push({
                            "gameid": actualRow.game_id,
                            "gamedatetime": actualRow.game_datetime,
                            "hometeam": actualRow.home_team_prefix,
                            "awayteam": actualRow.away_team_prefix,
                            "homepoints": actualRow.home_team_score,
                            "awaypoints": actualRow.away_team_score,
                            "isfinished": actualRow.game_finished,
                            "haspredicted": actualRow.predicted,
                            "predictedhometeam": actualRow.home_team_predicted
                        });
                        predictionsList.push(tempItem);
                    }
                    else {
                        predictionListItem[0].gamePredictions.push({
                            "gameid": actualRow.game_id,
                            "gamedatetime": actualRow.game_datetime,
                            "hometeam": actualRow.home_team_prefix,
                            "awayteam": actualRow.away_team_prefix,
                            "homepoints": actualRow.home_team_score,
                            "awaypoints": actualRow.away_team_score,
                            "isfinished": actualRow.game_finished,
                            "haspredicted": actualRow.predicted,
                            "predictedhometeam": actualRow.home_team_predicted
                        });
                    }
                }
                resp.data.predictionsForWeeks = predictionsList;
                getStandings(resp, res, connection, uuid);
            }
            else {
                resp.data.predictionsForWeeks = [];
                getStandings(resp, res, connection, uuid);
            }
        }
    });
}

function getStandings(resp, res, connection, uuid) {
    var sql = "SELECT teams.team_prefix as team_prefix, standings.prefix as clinching, standings.games as games, standings.score as score, standings.div_games as div_games " +
        "FROM standings " +
        "RIGHT JOIN teams " +
        "ON standings.team_id = teams.team_id " +
        "ORDER BY standings.standing_id;";
    connection.query(sql, function (err, rows) {
        if (err) {
            utils.handleError('getStandings - select query from standings', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(resp, res, connection, 500);
        }
        else {
            if (rows !== undefined) {
                var standingsList = [];
                for (var i = 0; i < rows.length; i++) {
                    var actualRow = rows[i];
                    var tempItem = {
                        "teamprefix": actualRow.team_prefix,
                        "clinching": actualRow.clinching,
                        "games": actualRow.games,
                        "score": actualRow.score,
                        "divgames": actualRow.div_games
                    };
                    standingsList.push(tempItem);
                }
                resp.data.standings = standingsList;
                getPredictionPlus(resp, res, connection, uuid);
            }
            else {
                resp.data.standings = [];
                getPredictionPlus(resp, res, connection, uuid);
            }
        }
    });
}

function getPredictionPlus(resp, res, connection, uuid) {
    getFirstGameDate(connection, function (gameDate) {
        var sql = "SELECT predictions_plus.user_id as userid, superbowl_team.team_prefix as superbowl, afc_winner_team.team_prefix as afc_winner, nfc_winner_team.team_prefix as nfc_winner, best_offense_team.team_prefix as best_offense, best_defense_team.team_prefix as best_defense " +
            "FROM predictions_plus " +
            "LEFT OUTER JOIN teams as superbowl_team ON superbowl = superbowl_team.team_id " +
            "LEFT OUTER JOIN teams as afc_winner_team ON afc_winner = afc_winner_team.team_id " +
            "LEFT OUTER JOIN teams as nfc_winner_team ON nfc_winner = nfc_winner_team.team_id " +
            "LEFT OUTER JOIN teams as best_offense_team ON best_offense = best_offense_team.team_id " +
            "LEFT OUTER JOIN teams as best_defense_team ON best_defense = best_defense_team.team_id " +
            "WHERE predictions_plus.user_id = ? OR predictions_plus.user_id = 3;";
        var inserts = [uuid];
        sql = mysql.format(sql, inserts);
        connection.query(sql, function (err, rows) {
            if (err) {
                utils.handleError('getPredictionPlus - select query from predictions_plus', err);
                resp.result = "failed";
                resp.message = err.message;
                utils.sendResponse(resp, res, connection, 500);
            }
            else {
                if (rows !== undefined) {
                    var predictionsPlus = [];
                    if (rows[0].userid == 3) {
                        defaultRow = rows[0];
                        userRow = rows[1];
                    } else {
                        defaultRow = rows[1];
                        userRow = rows[0];
                    }

                    predictionsPlus.push({
                        "user": "default",
                        "superbowl": defaultRow.superbowl === null ? "" : defaultRow.superbowl,
                        "afcwinnerteam": defaultRow.afc_winner === null ? "" : defaultRow.afc_winner,
                        "nfcwinnerteam": defaultRow.nfc_winner === null ? "" : defaultRow.nfc_winner,
                        "bestoffenseteam": defaultRow.best_offense === null ? "" : defaultRow.best_offense,
                        "bestdefenseteam": defaultRow.best_defense === null ? "" : defaultRow.best_defense,
                        "firstgamedate": gameDate
                    });
                    predictionsPlus.push({
                        "user": "user",
                        "superbowl": userRow.superbowl === null ? "" : userRow.superbowl,
                        "afcwinnerteam": userRow.afc_winner === null ? "" : userRow.afc_winner,
                        "nfcwinnerteam": userRow.nfc_winner === null ? "" : userRow.nfc_winner,
                        "bestoffenseteam": userRow.best_offense === null ? "" : userRow.best_offense,
                        "bestdefenseteam": userRow.best_defense === null ? "" : userRow.best_defense,
                        "firstgamedate": gameDate
                    });

                    resp.result = "success";
                    resp.message = "data_full";
                    resp.data.predictionBeforeSeason = predictionsPlus;
                    utils.sendResponse(res, resp, connection, 200);
                }
                else {
                    resp.result = "success";
                    resp.message = "data_full";
                    resp.data.predictionBeforeSeason = [];
                    utils.sendResponse(res, resp, connection, 200);
                }
            }
        });
    })
}

function getFirstGameDate(connection, callback) {
    var sql = "SELECT DATE_FORMAT(game_datetime, \"%Y-%m-%d %T\") as game_datetime from games where season_type = \"REG\" ORDER BY game_datetime";
    connection.query(sql, function (err, rows) {
        if (err) {
            utils.handleError('getFirstGameDate - select query from games', err);
            callback("");
        }
        else {
            if (rows[0] !== undefined) {
                var gameDate = rows[0].game_datetime;
                callback(gameDate);
            }
            else {
                callback("");
            }
        }
    });
}

function getPredictionListItem(predictionsList, week, stype) {
    var tempList = [];
    for (var i = 0; i < predictionsList.length; i++) {
        if (predictionsList[i].week === week && predictionsList[i].type === stype) {
            tempList.push(predictionsList[i]);
            break;
        }
    }
    return tempList;
}

exports.getAllPredictionsForGame = function (req, res) {
    var resp = {
        "result": "",
        "message": "",
        "predictionlist": ""
    };
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('getAllPredictionsForGame - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql = "SELECT predictions.predicted as predicted, predictions.home_team_predicted as home_team_predicted, predictions.user_id as user_id, user.user_name as user_name " +
                "FROM predictions " +
                "RIGHT JOIN user ON predictions.user_id = user.user_id " +
                "WHERE predictions.game_id = ? " +
                "ORDER BY user.user_name ASC";
            var inserts = [req.body.gameid];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('getAllPredictionsForGame - select query from predictions', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    if (rows !== undefined) {
                        var predictionsList = [];
                        for (var i = 0; i < rows.length; i++) {
                            var actualRow = rows[i];
                            var tempObject = {
                                "predicted": actualRow.predicted,
                                "hometeampredicted": actualRow.home_team_predicted,
                                "userid": actualRow.user_id,
                                "username": actualRow.user_name
                            };
                            predictionsList.push(tempObject);
                        }

                        resp.result = "success";
                        resp.predictionlist = predictionsList;
                        utils.sendResponse(res, resp, connection, 200);
                    }
                    else {
                        resp.result = "success";
                        resp.predictionlist = [];
                        utils.sendResponse(res, resp, connection, 200);
                    }
                }
            });
        }
    });
};

exports.getAllPredictionsPlusForState = function (req, res) {
    var resp = {
        "result": "",
        "message": "",
        "predictionlist": ""
    };
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('getAllPredictionsPlusForState - poolConnection', err);
            resp.result = "failed";
            resp.message = err.message;
            utils.sendResponse(res, resp, connection, 500);
        }
        else {
            var sql = "SELECT user.user_name as username, user.user_id as userid, teams.team_prefix as teamprefix " +
                "FROM predictions_plus " +
                "JOIN user ON predictions_plus.user_id = user.user_id " +
                "LEFT JOIN teams ON predictions_plus.?? = teams.team_id " +
                "WHERE predictions_plus.user_id <> 3 " +
                "ORDER BY user.user_name ASC";
            var inserts = [req.body.predictionType];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('getAllPredictionsPlusForState - select query from predictions_plus', err);
                    resp.result = "failed";
                    resp.message = err.message;
                    utils.sendResponse(res, resp, connection, 500);
                }
                else {
                    if (rows !== undefined) {
                        var predictionsList = [];
                        for (var i = 0; i < rows.length; i++) {
                            var actualRow = rows[i];
                            var tempObject = {
                                "username": actualRow.username,
                                "userid": actualRow.userid,
                                "teamprefix": actualRow.teamprefix == null ? "" : actualRow.teamprefix
                            };
                            predictionsList.push(tempObject);
                        }

                        resp.result = "success";
                        resp.predictionlist = predictionsList;
                        utils.sendResponse(res, resp, connection, 200);
                    }
                    else {
                        resp.result = "success";
                        resp.predictionlist = [];
                        utils.sendResponse(res, resp, connection, 200);
                    }
                }
            });
        }
    });
};
