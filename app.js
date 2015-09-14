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


// © Chris Veness, MIT-licensed, http://www.movable-type.co.uk/scripts/latlong.html#equirectangular
function distance(lambda1,phi1,lambda2,phi2) {
  var R = 6371000; // meters
  difLambda = (lambda2 - lambda1) * Math.PI / 180;
  phi1 = phi1 * Math.PI / 180;
  phi2 = phi2 * Math.PI / 180;
  var x = difLambda * Math.cos((phi1+phi2)/2);
  var y = (phi2-phi1);
  var d = Math.sqrt(x*x + y*y);
  return R * d;
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


app.post('/sql/route', function (req, res) {
	var route = req.body.route;
	console.log('Received MySQL request for route: ', route);
	var query = "SELECT shapes.*, trips.* FROM shapes JOIN trips ON shapes.shape_index = trips.shape_index WHERE route_id = '" + route + "' AND trips.feed_index > 25";
	query = query + " LIMIT " + socrata.limit + " ;";
	connection.query(query, function (error, rows, fields) {
		console.log('Completed MySQL request for route: ', route);
		if (!error) {
      var pointlist = {}; 
      rows.forEach(function (point) {
        var id = point.shape_id;
        if (!pointlist.hasOwnProperty(id)) {
          pointlist[id] = {};
        }
        if (!pointlist[id].hasOwnProperty(point.direction_id)) {
          pointlist[id][point.direction_id] = [point];
        } else {
          var ti = pointlist[id][point.direction_id][0].trip_index;
          var cr = point.trip_index;
          if (ti == cr && (point.direction_id == 0 || point.direction_id == 1)) {
            pointlist[id][point.direction_id].push(point);
          }
        }
      });

      // currently I roll everything into one trip in each direction
      var sel = {0: [], 1:[]};
      for (id in pointlist) {
      	var rt = pointlist[id];
      	if (Array.isArray(rt[0]) && rt[0].length > 0) { sel[0] = sel[0].concat(rt[0]); }
      	if (Array.isArray(rt[1]) && rt[1].length > 0) { sel[1] = sel[1].concat(rt[1]); }
      }

      // then I clean the results of the merge(s)
      for (n in [0, 1]) {
				for (var i = 0; i < sel[n].length;  i++) {
					if (sel[n][i] == null || sel[n][i] == undefined || typeof sel[n][i] !== 'object') {
						sel[n].splice(i, 1);
					}
				}
			}

			// use distance measure to determine if sae trip for breadcrumbs
			var broken = {0: [], 1:[]};
      for (n in [0, 1]) {
      	var trip = [];
				for (var i = 0; i < sel[n].length;  i++) {
					if (i > 0) {
						var prior = sel[n][i-1],
								current = sel[n][i];
						var result = distance(current.shape_pt_lat, current.shape_pt_lon, prior.shape_pt_lat, prior.shape_pt_lon);
						if (result < 500 && i !== sel[n].length - 1) {
							trip.push(sel[n][i]);	
						} else {
							broken[n].push(trip);
							trip = [];
							trip.push(sel[n][i]);
						}
					} else {
						trip.push(sel[n][i]);
					}
					if (sel[n][i] == null || sel[n][i] == undefined || typeof sel[n][i] !== 'object') {
						sel[n].splice(i, 1);
					}
				}
			}

			res.status(200).send({pointlist: broken})
		} else {
			res.status(500).send({error: error})
		}
	});
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

  console.log('Example app listening at http://%s:%s', host, port);
});