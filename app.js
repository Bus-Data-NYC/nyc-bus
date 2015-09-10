var express = require('express');
var app = express();

app.set('view engine', 'ejs');
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
	token: 'ENTER'
};


// query class construction
var Query = function (query) {
	this.options = this.makeOptions(query);
	this.response;
};
Query.prototype.prepQuery = function (query) {
	query = query + '&';
	return query;
};
Query.prototype.makeOptions = function (query) {
	if (query == undefined) { query = ''; }
	else { query = this.prepQuery(query); } 
	var path = '/resource/' + socrata.source + '.json' + '?' + query + '$limit=50000&$$app_token=' + socrata.token;
	path = path.split(" ").join("%20");
	return {host: socrata.host, path: path};
};
Query.prototype.callback = function (response) {
  var str = '';
  response.on('data', function (chunk) {str += chunk;});
  response.on('end', function () { this.response = JSON.parse(str);
  console.log(this.response) });
};





var query = "$where=vehicle_type_code1 = 'BUS' OR vehicle_type_code2 = 'BUS' OR vehicle_type_code_3 = 'BUS' OR vehicle_type_code_4 = 'BUS' OR vehicle_type_code_5 = 'BUS' AND number_of_persons_killed > 0";
var q = new Query(query);
http.request(q.options, q.callback).end();







app.get('/', function (req, res) {
	res.render('index');
})

app.get('/socrata', function (req, res) {
	var mode = req.body.query;
	var allModes = ['BUS', 'BICYCLE', 'SCOOTER', 'TAXI', 'LIVERY VEHICLE'];
	if (mode in allModes) {

	} else {
		res.status(500).send()
	}
	res.render('index');
})

app.get('/query', function (req, res) {
	connection.query('SELECT route_id FROM routes', function (error, rows, fields) {
		if (!error) {
			routes = rows.map(function (row) { return String(row.route_id)});
			res.render('query', {routes: routes});
		} else {
			res.status(500).send({
				error: error
			})
		}
	});
});

app.post('/query', function (req, res){
	connection.query(req.body.query, function (error, rows, fields) {
		if (!error) {
			res.status(200).send({rows: rows, fields: fields});
		} else {
			res.status(500).send({error: error});
		}
	});
});

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});