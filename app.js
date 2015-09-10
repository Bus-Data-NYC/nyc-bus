var express = require('express');
var app = express();

app.set('view engine', 'ejs');
app.use('/static',  express.static(__dirname + '/static'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// sql connection
var mysql      = require('mysql');
var credentials = require('./credentials.js');

var connection = mysql.createConnection({
  host     : credentials.host,
  user     : credentials.username,
  password : credentials.password,
  database : credentials.database,
});
connection.connect(function(err){
	if(!err) {
	  console.log("Database is connected ... \n\n");  
	} else {
	  console.log("Error connecting database ... \n\n");  
	}
});

var http = require('http');

// socrata secrets
var socrata = {
	host: 'data.cityofnewyork.us',
	source: 'h9gi-nx95',
	token: credentials.s_token,
	limit: 50000,
};


// query class construction
var Query = function (query) {
	this.options = this.makeOptions(query);
	this.response;
};
Query.prototype.makeOptions = function (query) {
	if (query == undefined) { query = ''; }
	else { query = query + '&'; } 
	var path = '/resource/' + socrata.source + '.json?' + query + '$limit=' + socrata.limit + '&$$app_token=' + socrata.token;
	path = path.split(" ").join("%20");
	return {host: socrata.host, path: path};
};


app.get('/', function (req, res) {
	res.render('index');
})

app.post('/socrata', function (req, res) {
	var mode = req.body.mode;
	var kill = req.body.kill;
	var injure = req.body.injure;
	var allModes = ['BUS', 'BICYCLE', 'SCOOTER', 'TAXI', 'LIVERY VEHICLE'];
	if (allModes.indexOf(mode) > -1) {
		var query = "$where=vehicle_type_code1 = '" + mode + "' OR vehicle_type_code2 = '" + mode + 
								"' OR vehicle_type_code_3 = '" + mode + "' OR vehicle_type_code_4 = '" + mode + 
								"' OR vehicle_type_code_5 = '" + mode + "' AND number_of_persons_killed>=" + kill + 
								" AND number_of_persons_injured>=" + injure;
		var q = new Query(query);
		var callback = function (response) {
		  var str = '';
		  response.on('data', function (chunk) {str += chunk;});
		  response.on('end', function () { 
		  	var data = JSON.parse(str);
		  	res.status(200).send({data: data});
		  });
		};
		http.request(q.options, callback).end();
	} else {
		res.status(500).send()
	}
})

app.get('/query', function (req, res) {
	connection.query('SELECT route_id FROM routes', function (error, rows, fields) {
		if (!error) {
			res.render('query', {routes: routes});
			res.status(500).send({error: error})
		} else {
			res.status(500).send({error: error})
		}
	});
});


var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});