var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var _ = require('underscore');
var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');

var wishlistUrlTemplate = 'http://www.amazon.co.uk/registry/wishlist/${wishlistId}?layout=compact'
var wishlistId = '1QJBF75CZDO9E'

var file = 'db/fancy.db';
var dbExists = fs.existsSync(file);
var db = new sqlite3.Database(file);
db.run('CREATE TABLE IF NOT EXISTS wishlist (wishlist TEXT, title TEXT, buy TEXT, price REAL, want INTEGER, got INTEGER, priority TEXT)');


function Fancy(wishlistId) {
	this.wishlistId = wishlistId;
	this.wishlistUrl = wishlistUrlTemplate.replace('${wishlistId}', wishlistId);
}

Fancy.prototype.update = function(cb) {
	var items = [];
	var currentPage = 0;
	var totalPages = null;
	async.doWhilst(
		function(done) {
			currentPage++;
			var url = wishlistUrl + '&page=' + currentPage;
			console.log('requesting url %s', url);
	    	request(url, { encoding: 'binary' }, function(err, resp, body) {
	    		if (!err && resp.statusCode === 200) {
	    			$ = cheerio.load(body);
	    			totalPages = parseInt($('.num-pages').text());

	    			var newItems = processItems($);
	    			console.log('Processed %d items in page %d', newItems.length, currentPage);
	    			items = items.concat(newItems);
	    			
	    			done();
	    		}
	    	});
	    },
	    function() {
	    	console.log('currentPage %d of totalPages %d', currentPage, totalPages);
	    	return currentPage < totalPages;
	    },
	    function(err) {
	    	db.serialize(function() {
	    		var stmt = db.prepare('INSERT INTO wishlist VALUES (?, ?, ?, ?, ?, ?, ?)');
    			items.forEach(function(item) {
    				stmt.run(wishlistId, item.title, item.buy, item.price, item.want, item.got, item.priority);
    			});

    			stmt.finalize();
    			db.close();
	    	});		    	
	    }
    );
};