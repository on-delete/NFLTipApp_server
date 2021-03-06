var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var login = require('./public/javascripts/login');
var register = require('./public/javascripts/register');
var updateTask = require('./public/javascripts/updateTask');
var data = require('./public/javascripts/data');
var update = require('./public/javascripts/updates');
var password = require('./public/javascripts/password');

var index = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);

/* Uncomment if automatic updates should be triggered again */
updateTask.startUpdateTask();
updateTask.startGameUpdatesTask();

app.get('/startUpdate', function (req, res) {
    updateTask.update();
    //updateTask.startGameUpdatesTask();
    res.end();
});

app.post('/nameExisting', function (req, res) {
    register.nameExisting(req, res);
});

app.post('/registerUser', function (req, res) {
    register.registerUser(req, res);
});

app.post('/loginUser', function (req, res) {
    login.loginUser(req, res);
});

app.post('/getData', function (req, res){
    data.getData(req, res);
});

app.post('/getAllPredictionsForGame', function (req, res) {
    data.getAllPredictionsForGame(req, res);
});

app.post('/getAllPredictionsPlusForState', function (req, res) {
    data.getAllPredictionsPlusForState(req, res);
});

app.post('/updatePrediction', function (req, res) {
    update.updatePrediction(req, res);
});

app.post('/updatePredictionPlus', function (req, res) {
    update.updatePredictionPlus(req, res);
});

app.post('/resetPassword', function (req, res) {
    password.recoveryPassword(req, res);
});

app.get('/resetPassword', function (req, res) {
    password.renderWebsite(req, res);
});

app.post('/resetPasswordInternal', function (req, res) {
    register.updatePassword(req, res);
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
