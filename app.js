var express = require('express');
var app = express();

var mysql      = require('mysql');
var credentials = require('./credentials.js');

var connection = mysql.createConnection({
  host     : credentials.host,
  user     : credentials.username,
  password : credentials.password,
  database : credentials.database,
});
var app = express();

connection.connect(function(err){
if(!err) {
    console.log("Database is connected ... \n\n");  
} else {
    console.log("Error connecting database ... \n\n");  
}
});

app.get("/",function(req,res){
connection.query("SELECT EXTRACT(YEAR_MONTH FROM sh.date) AS month, IF(WEEKDAY(sh.date) > 4, 'Weekend', 'Weekday') AS weekday, SUM(sh.scheduled), SUM(a.fulfilled), 100 * SUM(a.fulfilled) / SUM(sh.scheduled) AS fulfilled_pc FROM rds, schedule_hours AS sh LEFT JOIN adherence AS a ON (sh.date = a.date AND sh.rds = a.rds AND sh.hour = a.hour) WHERE route_id = 'M35' AND sh.rds = rds.rds AND sh.date < '2015-08-01' AND sh.hour BETWEEN 12 AND 15 AND !no_data GROUP BY month, weekday;", function(err, rows, fields) {
connection.end();
  if (!err)
    console.log('The solution is: ', rows);
  else
    console.log('Error while performing Query.');
  });
});

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});