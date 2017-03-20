var utils = require('./utils');
var mysql = require('mysql');
var schedule = require('node-schedule');
var limit = require("simple-rate-limiter");
var request = limit(require("request")).to(1).per(1000);
var requestWebsite = require("request");
var parseString = require('xml2js').parseString;
var cheerio = require("cheerio");

var reg_saison_weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
var post_saison_weeks = [18, 19, 20, 22];
var saison_parts = ['REG', 'POST'];
var saison_years = [2016];
var request_string = 'http://www.nfl.com/ajax/scorestrip?season=';

var exports = module.exports;

exports.startUpdateTask = function () {
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [new schedule.Range(0, 6)];
    rule.hour = [1, 13];
    rule.minute = 0;

    var j = schedule.scheduleJob(rule, function () {
        var d = new Date();
        utils.handleInfo('new update is started at ' + d);
        updateSchedule();
        updateStandings();
        updatePredictionsPlus();
    });
};

function updateSchedule() {
    saison_years.forEach(function (year) {
        saison_parts.forEach(function (spart) {
            var weeks;
            switch (spart) {
                case 'REG' :
                    weeks = reg_saison_weeks;
                    break;
                case 'POST' :
                    weeks = post_saison_weeks;
                    break;
                default :
                    break;
            }

            weeks.forEach(function (week) {
                request(replaceValuesInSring(year, spart, week), function (error, response, body) {
                    utils.handleInfo('Update schedule for week ' + week + ' in Part ' + spart + ' for year ' + year);
                    if (!error && response.statusCode == 200) {
                        parseString(body, function (err, result) {
                            if (result.ss !== '') {
                                result.ss.gms[0].g.forEach(function (game) {
                                    checkIfGameAlreadyPresent(game, result.ss.gms[0].$.w);
                                });
                            }
                        });
                    }
                    else {
                        utils.handleError('Failed request to NFL rest.', error);
                    }
                });
            })
        })
    });
}

function replaceValuesInSring(year, stype, sweek) {
    return request_string + year + '&seasonType=' + stype + '&week=' + sweek;
}

function checkIfGameAlreadyPresent(game, week) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('checkIfGameAlreadyPresent - poolConnection', err);
        }
        else {
            var sql = "SELECT * FROM games WHERE game_id = ?";
            var inserts = [game.$.eid];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('checkIfGameAlreadyPresent - select query games', err);
                }
                else {
                    if (rows[0] !== undefined) {
                        if (game.$.q !== 'P' && !rows[0].game_finished) {
                            updatePresentGame(game);
                        }
                    }
                    else {
                        insertNewGame(game, week);
                    }

                    if (week == 20) {
                        updateAFCNFCWinner(game);
                    }

                    if (week == 22) {
                        updateSuperBowlWinner(game);
                    }
                }
            });
        }
        connection.release();
    });
}

function updatePresentGame(game) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('updatePresentGame - poolConnection', err);
        }
        else {
            var sql = "UPDATE games SET game_finished=?, home_team_score=?, away_team_score=?, game_datetime=? WHERE game_id=?";
            var inserts = [true, game.$.hs, game.$.vs, game.$.eid, getGameDateTime(game.$.eid, game.$.t)];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err) {
                if (err) {
                    utils.handleError('updatePresentGame - update query games', err);
                }
            });
        }
        connection.release();
    });
}

function insertNewGame(game, week) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('insertNewGame - poolConnection', err);
        }
        else {
            var sql = "INSERT INTO games (game_id, game_datetime, game_finished, home_team_score, away_team_score, week, season_type, home_team_id, away_team_id) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT team_id FROM teams WHERE team_prefix=?), (SELECT team_id FROM teams WHERE team_prefix=?));";
            var inserts = [game.$.eid, getGameDateTime(game.$.eid, game.$.t), (game.$.q !== 'P'), game.$.hs, game.$.vs, week, game.$.gt, game.$.h, game.$.v];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err) {
                if (err) {
                    utils.handleError('insertNewGame - insert query games', err);
                }
                else {
                    insertNewPrediction(game.$.eid);
                }
            });
        }
        connection.release();
    });
}

function getGameDateTime(gameId, time) {
    var year = gameId.substr(0, 4);
    var month = gameId.substr(4, 2);
    var day = gameId.substr(6, 2);

    return year + "-" + month + "-" + day + " " + time + ":00";
}

function insertNewPrediction(gameid) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('insertNewPrediction - poolConnection', err);
        }
        else {
            var sql = "INSERT INTO predictions (user_id, predicted, home_team_predicted, game_id) select user_id, 'false', 'NULL', ? from user WHERE user_id <> 3;";
            var inserts = [gameid];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, result) {
                if (err) {
                    utils.handleError('insertNewPrediction - insert query predictions', err);
                }
            });
        }
        connection.release();
    });
}

function updateAFCNFCWinner(game) {
    if (game.$.q !== 'P') {
        var team;

        if (game.$.hs > game.$.vs) {
            team = game.$.h;
        }
        else {
            team = game.$.v;
        }

        utils.pool.getConnection(function (err, connection) {
            if (err) {
                utils.handleError('updateAFCNFCWinner - poolConnection', err);
            }
            else {
                var sql = "SELECT team_id, team_division FROM teams WHERE team_prefix = ?;";
                var inserts = [team];
                sql = mysql.format(sql, inserts);
                connection.query(sql, function (err, result) {
                    if (err) {
                        utils.handleError('updateAFCNFCWinner - select query teams', err);
                    }
                    else {
                        if (result[0] !== undefined) {
                            var teamId = result[0].team_id;
                            var teamDivision = result[0].team_division;
                            var inserts;

                            if (teamDivision == 'afc') {
                                inserts = ['afc_winner', teamId];
                            }
                            else {
                                inserts = ['nfc_winner', teamId];
                            }

                            sql = "UPDATE predictions_plus " +
                                "SET ?? = ? " +
                                "WHERE user_id = 3;";
                            sql = mysql.format(sql, inserts);
                            connection.query(sql, function (err) {
                                if (err) {
                                    utils.handleError('updateAFCNFCWinner - update query predictions_plus', err);
                                }
                            });
                        }
                    }
                });
            }
            connection.release();
        });
    }
}

function updateSuperBowlWinner(game) {
    if (game.$.q !== 'P') {
        var team;

        if (game.$.hs > game.$.vs) {
            team = game.$.h;
        }
        else {
            team = game.$.v;
        }

        utils.pool.getConnection(function (err, connection) {
            if (err) {
                utils.handleError('updateSuperBowlWinner - poolConnection', err);
            }
            else {
                var sql = "UPDATE predictions_plus " +
                    "JOIN teams " +
                    "ON ? = teams.team_prefix " +
                    "SET superbowl = teams.team_id " +
                    "WHERE user_id = 3;";
                var inserts = [team];
                sql = mysql.format(sql, inserts);
                connection.query(sql, function (err, result) {
                    if (err) {
                        utils.handleError('updateSuperBowlWinner - update query predictions_plus', err);
                    }
                });
            }
            connection.release();
        });
    }
}

function updateStandings() {
    var standings = [];
    var teamStanding;

    requestWebsite('http://www.nfl.com/standings', function (error, response, html) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(html);
            $('tr.tbdy1').each(function () {

                var prefix = "", teamname = "", games = "", score = "", div_games = "";

                var tableColumns = $(this).find('td');
                tableColumns.each(function (i, element) {
                    if (i < 5 || i == 11) {
                        switch (i) {
                            case 0: {
                                if ($(this).text().trim().indexOf('-') != -1) {
                                    prefix = $(this).text().trim().charAt(0);
                                }
                                teamname = $(this).find('a').text().trim();
                                break;
                            }
                            case 1: {
                                games += $(this).text().trim();
                                break;
                            }
                            case 2: {
                                games += "-" + $(this).text().trim();
                                break;
                            }
                            case 3: {
                                if (parseInt($(this).text().trim()) > 0) {
                                    games += "-" + $(this).text().trim();
                                }
                                break;
                            }
                            case 4: {
                                score = $(this).text().trim();
                                break;
                            }
                            case 11: {
                                div_games = $(this).text().trim();
                                break;
                            }
                            default:
                                break;
                        }
                    }
                });

                teamStanding = {
                    "prefix": prefix,
                    "teamname": teamname,
                    "games": games,
                    "score": score,
                    "div_games": div_games
                };
                standings.push(teamStanding);
            });

            insertIntoStandingsTable(standings);
        }
        else{
            utils.handleError('Failed request on NFL standings site', error);
        }
    });
}

function insertIntoStandingsTable(standings) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('insertIntoStandingsTable - poolConnection', err);
        }
        else {
            var sql = 'DELETE FROM standings';
            connection.query(sql, function (err) {
                if (err) {
                    utils.handleError('insertIntoStandingsTable - delete query standings', err);
                    connection.destroy();
                }
                else {
                    var i = -1;
                    (function insertNewStanding() {
                        i++;
                        if (i < standings.length) {
                            var standing = standings[i];
                            var sql = "INSERT INTO standings (standing_id, team_id, prefix, games, score, div_games) VALUES (?, (SELECT team_id FROM teams WHERE team_name=?), ?, ?, ?, ?);";
                            var inserts = [i + 1, standing.teamname, (standing.prefix == '' ? null : standing.prefix), standing.games, standing.score, standing.div_games];
                            sql = mysql.format(sql, inserts);
                            connection.query(sql, function (err) {
                                if (err) {
                                    utils.handleError('insertIntoStandingsTable - insert query standings', err);
                                    connection.destroy();
                                }
                                else {
                                    insertNewStanding();
                                }
                            });
                        }
                        else {
                            connection.destroy();
                        }
                    })();
                }
            });
        }
    });
}

function updatePredictionsPlus() {
    requestWebsite('http://www.nfl.com/stats/team?seasonId=' + saison_years + '&seasonType=' + saison_parts[0], function (error, response, html) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(html);

            var bestOffenseRow = $('#r1c1_1');
            var bestOffenseTeamName = bestOffenseRow.find('a').text().trim();

            var bestDefenseRow = $('#r1c2_1');
            var bestDefenseTeamName = bestDefenseRow.find('a').text().trim();

            updatePredictionsPlusInDatabase(bestOffenseTeamName, bestDefenseTeamName);
        }
        else{
            utils.handleError('Failed request on NFL stats site', error);
        }
    });
}

function updatePredictionsPlusInDatabase(bestOffenseTeamName, bestDefenseTeamName) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('updatePredictionsPlusInDatabase - poolConnection', err);
        }
        else {
            var sql = "UPDATE predictions_plus " +
                "JOIN teams AS teams_offense " +
                "ON ? = teams_offense.team_name " +
                "JOIN teams AS teams_defense " +
                "ON ? = teams_defense.team_name " +
                "SET ?? = teams_offense.team_id, ?? =  teams_defense.team_id " +
                "WHERE user_id = 3;";
            var inserts = [bestOffenseTeamName, bestDefenseTeamName, 'best_offense', 'best_defense'];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err) {
                if (err) {
                    utils.handleError('updatePredictionsPlusInDatabase - update query predictions_plus', err);
                }
                else {
                    utils.handleInfo('Best offense and defence were updated');
                }
                connection.destroy();
            });
        }
    });
}
