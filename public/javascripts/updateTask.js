var utils = require('./utils');
var mysql = require('mysql');
var schedule = require('node-schedule');
var limit = require("simple-rate-limiter");
var request = limit(require("request")).to(1).per(500);
var requestWebsite = require("request");
var parseString = require('xml2js').parseString;
var cheerio = require("cheerio");
var moment = require("moment");

var reg_saison_weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
var post_saison_weeks = [18, 19, 20, 22];
var saison_parts = ['REG', 'POST'];
var saison_year = 2018;
var request_string = 'http://www.nfl.com/ajax/scorestrip?season=';

//http://www.nfl.com/ajax/scorestrip?season=2017&seasonType=REG&week=1

var exports = module.exports;

exports.update = function () {
    var d = new Date();
    utils.handleInfo('new update is started at ' + d);
    updateSchedule();
    updateStandings();
    // updatePredictionsPlus();
};

exports.startUpdateTask = function () {
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [new schedule.Range(0, 6)];
    rule.hour = 12;
    rule.minute = 0;

    var j = schedule.scheduleJob(rule, function () {
        innerUpdate();
    });
};

function innerUpdate() {
    var d = new Date();
    utils.handleInfo('new update is started at ' + d);
    updateSchedule();
    updateStandings();
    // updatePredictionsPlus();
}

exports.startGameUpdatesTask = function () {
    var job = new schedule.scheduleJob('*/5 * * * *', function () {
         checkIfGamesStarted();
    });
};

function checkIfGamesStarted() {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('checkIfGamesStarted - poolConnection', err);
        }
        else {
            var time = moment().tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');
            var sql = 'SELECT game_id, week, season_type from games where game_datetime <= ? AND game_finished = 0';
            var inserts = [time];
            sql = mysql.format(sql, inserts);
            connection.query(sql, function (err, rows) {
                if (err) {
                    utils.handleError('checkIfGamesStarted - select query games', err);
                }
                else {
                    if (rows.length > 0) {
                        var tempWeek = rows[0].week;
                        var tempSeasonType = rows[0].season_type;

                        request(replaceValuesInSring(saison_year, tempSeasonType, tempWeek), function (error, response, body) {
                            if (!error && response.statusCode === 200) {
                                parseString(body, function (err, result) {
                                    if (result.ss !== '') {
                                        for(var i = 0; i < rows.length; i++) {
                                            result.ss.gms[0].g.forEach(function (game) {
                                                if(game.$.eid == rows[i].game_id && game.$.q != 'P'){
                                                    updatePresentGame(game, true);
                                                    updateStandings();

                                                    if (tempWeek === 20) {
                                                        updateAFCNFCWinner(game);
                                                    }

                                                    if (tempWeek === 22) {
                                                        updateSuperBowlWinner(game);
                                                    }
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                            else {
                                utils.handleError('Failed request to NFL rest.', error);
                            }
                        });
                    }
                }
            });
        }
        connection.release();
    });
}

function updateSchedule() {
    saison_parts.forEach(function (spart) {
        var weeks = spart === 'REG' ? reg_saison_weeks : post_saison_weeks;

        weeks.forEach(function (week) {
            request(replaceValuesInSring(saison_year, spart, week), function (error, response, body) {
                utils.handleInfo('Update schedule for week ' + week + ' in Part ' + spart + ' for year ' + saison_year);
                if (!error && response.statusCode === 200) {
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
                        if (game.$.q !== 'P') {
                            updatePresentGame(game, true);
                        } else {
                            updatePresentGame(game, false);
                        }
                    }
                    else {
                        insertNewGame(game, week);
                    }
                }
            });
        }
        connection.release();
    });
}

function updatePresentGame(game, finished) {
    utils.pool.getConnection(function (err, connection) {
        if (err) {
            utils.handleError('updatePresentGame - poolConnection', err);
        }
        else {
            var sql = "UPDATE games SET game_finished=?, home_team_score=?, away_team_score=?, game_datetime=? WHERE game_id=?";
            var inserts = [finished, game.$.hs, game.$.vs, getGameDateTime(game.$.eid, game.$.t), game.$.eid];
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
        var team = game.$.hs > game.$.vs ? game.$.h : game.$.v;

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
                            var inserts = teamDivision === 'afc' ? ['afc_winner', teamId] : ['nfc_winner', teamId];

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
        var team = game.$.hs > game.$.vs ? game.$.h : game.$.v;

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

    requestWebsite('https://www.foxsports.com/nfl/standings', function (error, response, html) {
        if (!error && response.statusCode === 200) {
            var $ = cheerio.load(html);
            $('tbody').each(function () {

                var tableRow = $(this).find('tr');
                tableRow.each(function (i, element) {

                    var prefix = "", games = "", score = "", div_games = "", teamprefix = "";

                    var rowColumn = $(this).find('td');

                    if(rowColumn.length > 0) {
                        rowColumn.each(function (i, element) {

                            if (i < 5 || i === 10) {
                                switch (i) {
                                    case 0: {
                                        var spans = $(this).find('a').find('span');
                                        spans.each(function (i, element) {
                                            switch (i) {
                                                case 1: {
                                                    teamprefix = $(this).text();
                                                    break;
                                                }
                                                default:
                                                    break;
                                            }
                                        });

                                        prefix = $(this).find('.wisbb_clinched').text().trim().toLowerCase();
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
                                    case 10: {
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
                            "games": games,
                            "score": score,
                            "div_games": div_games,
                            "teamprefix": teamprefix
                        };
                        standings.push(teamStanding);
                    }
                });
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
                            if(standing.teamprefix === 'WSH'){
                                standing.teamprefix = 'WAS';
                            }
                            if(standing.teamprefix === 'LAR'){
                                standing.teamprefix = 'LA';
                            }
                            if(standing.teamprefix === 'ARZ'){
                                standing.teamprefix = 'ARI';
                            }

                            var sql = "INSERT INTO standings (standing_id, team_id, prefix, games, score, div_games) VALUES (?, (SELECT team_id FROM teams WHERE team_prefix=?), ?, ?, ?, ?);";
                            var inserts = [i + 1, standing.teamprefix, (standing.prefix === '' ? null : standing.prefix), standing.games, standing.score, standing.div_games];
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
    requestWebsite('http://www.nfl.com/stats/categorystats?seasonType=REG&offensiveStatisticCategory=null&d-447263-n=1&d-447263-o=1&d-447263-p=1&d-447263-s=TOTAL_POINTS_SCORED&tabSeq=2&season=' + saison_year + '&role=OPP&archive=false&conference=null&defensiveStatisticCategory=SCORING&qualified=false', function (error, response, html) {
        if (!error && response.statusCode === 200) {
            var bestDefenseTeamName = extractTeamName(html);

            requestWebsite('http://www.nfl.com/stats/categorystats?archive=false&conference=null&role=TM&offensiveStatisticCategory=SCORING&defensiveStatisticCategory=null&season=' + saison_year + '&seasonType=REG&tabSeq=2&qualified=false', function (error, response, html) {
                if (!error && response.statusCode === 200) {

                    var bestOffenseTeamName = extractTeamName(html);
                    updatePredictionsPlusInDatabase(bestOffenseTeamName, bestDefenseTeamName);
                }
                else{
                    utils.handleError('Failed request on NFL stats site', error);
                }
            });
        }
        else{
            utils.handleError('Failed request on NFL stats site', error);
        }
    });
}

function extractTeamName(html) {
    var $ = cheerio.load(html);

    var tables = $('html').find('tbody');
    var table = tables[0];
    var row = table.children[1];
    var rowEntry = row.children[3];
    var textEntry = rowEntry.children[1];
    var text = textEntry.children[0];
    return text.data;
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
