var express = require('express');
var request = require('request');

var app = express();

require('./auth')(app); // all the oauth authorisation routing is in here

console.log('Listening on 8888');
app.listen(8888);
