var express = require('express');
var app = express();
app.set('view engine', 'ejs');

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

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

app.get("/", function (req, res) {
	res.render('index');
})

app.get("/query", function (req, res) {
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

app.post("/query", function (req, res){
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