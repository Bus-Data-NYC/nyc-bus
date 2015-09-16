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
	limit: 10000,
};

var buslines = require('./static/data/buslines.js');
var shapefiler = require('./methods/shapefiler.js');


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


// identify bus route
function getRouteId (id) {
	var route = buslines[id];
	if (route == undefined) {
		id = id.toUpperCase();
		for (var rte in buslines) {
		  if (buslines.hasOwnProperty(rte)) {
	      if (buslines[rte] === id) {
	        route = buslines[rte];
	      } else if (rte == id) {
	      	route = buslines[rte];
	      }
		  }
		}
	} 
	if (route == undefined) {
		return false;
	} else {
		return route;
	}
}


app.get('/', function (req, res) {
	var bl = Object.keys(buslines);
	res.render('index', {buslines: bl});
})

app.get('/shape/:id', function(req, res) {

	// identify bus route and handle case exceptions
	var route = getRouteId(req.params.id);

	// fail if can't find route
	if (route == false) {
		res.status(404).send('Query id does not exist.');
	} else {

		// continue and create shapefile
		var query = "SELECT shapes.*, trips.* FROM shapes JOIN trips ON shapes.shape_index = trips.shape_index WHERE route_id = '" + route + "' AND trips.feed_index > 25";
		connection.query(query, function (error, rows, fields) {
			console.log('Completed MySQL request for route: ', route);
			if (!error) {
				res.status(500).send('Error on internal SQL query.');
			} else {
				// do something
				var sf = new shapefiler;
				var m = sf.create();
				console.log(m);
			}
		});

		// res.status(200).send('user ' + route);
		res.render('shapefile.ejs')
	}
});

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


app.get('/route/:id', function (req, res) {

	var route = getRouteId(req.params.id);
	if (route == false) {
		res.status(404).send('Query id does not exist.');
	}

	console.log('Received MySQL request for route: ', route);

	var query = {
		properties: 'SELECT route_id, agency_id, route_short_name, route_long_name, route_desc, route_url, route_color, route_text_color FROM routes_current WHERE route_id = "' + route + '";',
		directions: 'SELECT direction_id, direction_name FROM directions WHERE route_id = "' + route + '";',
		stops0:     'SELECT stops_current.stop_id, stop_name, "" AS stop_desc, stop_lat, stop_lon FROM stops_current JOIN rds ON stops_current.stop_id = rds.stop_id WHERE route_id = "' + route + '" AND direction_id = 0;',
		stops1:     'SELECT stops_current.stop_id, stop_name, "" AS stop_desc, stop_lat, stop_lon FROM stops_current JOIN rds ON stops_current.stop_id = rds.stop_id WHERE route_id = "' + route + '" AND direction_id = 1;',
	};

	function runQ (key, r) {
		connection.query(r, function (error, rows, fields) {
			if (error) {
				res.status(500).send({error: error});
			} else {
				results[key] = rows;
				if (i == (reqs.length - 1)) {
					results = runClean(results);
					getRoute();
				} else {
					i = i + 1;
					runQ(reqs[i], query[reqs[i]]);
				}
			}
		})
	};

	function runClean (results) {
		var out = results.properties[0];
		out.directions = {
			0: results.directions[0].direction_name,
			1: results.directions[1].direction_name
		};
		out.stops = {
			0: results.stops0,
			1: results.stops1
		};
		return out;
	}

	function getRoute () {
		var query = "SELECT shapes.*, trips.* FROM shapes JOIN trips ON shapes.shape_index = trips.shape_index WHERE route_id = '" + route + "' AND trips.feed_index > 25";
		query = query + " LIMIT " + socrata.limit + " ;";
		connection.query(query, function (error, rows, fields) {
			if (error) {
				res.status(500).send({error: error})
			} else {
				if (results == undefined) {
					res.status(500).send('Results object missing.')
				} else {
					var sf = new shapefiler(rows);
					results.path = sf.create().getCleaned();
					if (results.path == null) {
						res.status(500).send('Cleaned data returned null.');
					} else {
						console.log('got here');
						res.status(200).send({routeData: results});
					}
				}
			}
		});
	}

	var results = {};
	var reqs = Object.keys(query),
			i = 0;
	runQ(reqs[i], query[reqs[i]]);

});

app.post('/sql/route/stops', function (req, res) {
	var route = req.body.route;
	res.status(200).send();
	// connection.query(query, function (error, rows, fields) {
	// 	console.log('Completed MySQL request for route: ', route);
	// 	if (!error) {
	// 		res.status(200).send({rows: rows, fields: fields})
	// 	} else {
	// 		res.status(500).send({error: error})
	// 	}
	// });
});


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

  console.log('Bus app listening at http://%s:%s', host, port);
});